const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const PROMPT_FACTURA = `
Analiza la imagen o PDF de una factura, recibo, ticket, voucher o comprobante guatemalteco y devuelve ÚNICAMENTE un JSON válido, sin explicaciones, sin texto adicional, sin bloques markdown y sin comentarios.

La estructura del JSON debe ser EXACTAMENTE esta:

{
  "Fecha": "YYYY-MM-DD o null",
  "FechaOriginal": "string o null",
  "DocDate": "YYYY-MM-DD o null",
  "U_DoctoNo": "string o null",
  "U_DoctoSerie": "string o null",
  "U_D_UUID": "string o null",
  "U_Nit": "string o null",
  "U_Nombre": "string o null",
  "Details": [
    {
      "ItemCode": "string o null",
      "Description": "string o null",
      "LineTotal": 0,
      "Cantidad": 1
    }
  ],
  "DocTotal": 0,
  "SumLineTotal": 0
}

Reglas generales de extracción:
- Devuelve SOLO JSON válido parseable con JSON.parse().
- No devuelvas explicaciones, texto adicional, comentarios, markdown ni bloques tipo \`\`\`json.
- Respeta exactamente los nombres de las propiedades indicadas.
- No inventes datos.
- Si un campo no aparece claramente, devuelve null.
- Excepción: si el documento es recibo, ticket, voucher, comprobante simple o no contiene datos fiscales suficientes para ser factura, usa U_DoctoSerie: "R_" y los campos de encabezado que no encuentres devuélvelos como string vacío "" en lugar de null.

Reglas para identificar si es factura fiscal:
- Si contiene datos como factura, DTE, documento tributario electrónico, número de autorización, UUID, firma electrónica, serie, número, NIT emisor y datos fiscales, trátalo como factura.
- Si no contiene datos fiscales suficientes, trátalo como recibo o comprobante simple y coloca U_DoctoSerie: "R_".

Campos de encabezado:
- FechaOriginal: fecha tal como aparece escrita en el documento.
- Fecha: fecha del documento convertida a formato YYYY-MM-DD.
- DocDate: debe tener exactamente el mismo valor que Fecha.
- U_DoctoNo: número de factura, número de documento o número interno visible.
- U_DoctoSerie: serie de la factura o documento.
- U_D_UUID: autorización, firma electrónica, UUID o número de autorización electrónica.
- U_Nit: NIT del emisor o proveedor. Si hay varios NIT, usa el NIT del emisor/proveedor, no el del comprador/receptor.
- U_Nombre: nombre del emisor o proveedor.
- DocTotal: total final del documento.

Reglas estrictas para fechas:
- Si hay varias fechas, usa la fecha de emisión del documento.
- Si existe fecha de certificación y fecha de emisión, usa la fecha de emisión.
- Si solo existe fecha de certificación, usa esa.
- Si la fecha visible está en formato DD/MM/YYYY, interprétala SIEMPRE como día/mes/año.
- Ejemplo: 03/04/2026 significa 2026-04-03.
- No uses formato MM/DD/YYYY.
- Convierte fechas con meses escritos en español a formato YYYY-MM-DD.
- Ejemplos:
  - 28-abr-2026 = 2026-04-28
  - 28/abr/2026 = 2026-04-28
  - 28 abril 2026 = 2026-04-28
  - 28 de abril de 2026 = 2026-04-28
  - 28-ene-2026 = 2026-01-28
  - 28-feb-2026 = 2026-02-28
  - 28-mar-2026 = 2026-03-28
  - 28-abr-2026 = 2026-04-28
  - 28-may-2026 = 2026-05-28
  - 28-jun-2026 = 2026-06-28
  - 28-jul-2026 = 2026-07-28
  - 28-ago-2026 = 2026-08-28
  - 28-sep-2026 = 2026-09-28
  - 28-oct-2026 = 2026-10-28
  - 28-nov-2026 = 2026-11-28
  - 28-dic-2026 = 2026-12-28

Reglas para Details:
- Extrae el detalle de la factura en el arreglo "Details".
- Cada línea, producto o servicio visible debe convertirse en un objeto independiente dentro del arreglo.
- No agrupes productos o servicios.
- No omitas líneas visibles del documento.
- Description: descripción exacta o lo más cercana posible del producto o servicio.
- LineTotal: total monetario de esa línea.
- LineTotal debe ser el total de la línea completa, no el precio unitario, especialmente cuando Cantidad sea mayor que 1.
- Cantidad: cantidad de la línea. Si no aparece claramente, devuelve 1.
- Si hay columna de cantidad y precio unitario, calcula LineTotal = Cantidad * PrecioUnitario cuando el total de línea no esté claro.
- Si hay descuentos por línea, LineTotal debe ser el total neto de esa línea después del descuento.
- Si no hay detalles identificables, devuelve "Details": [].

Clasificación ItemCode:
- ItemCode debe clasificar cada línea según el tipo de compra:
  - Si es comida o bebida: "90012"
  - Si es hospedaje, hotel, alojamiento o servicios hoteleros: "90023"
  - Si son herramientas: "90007"
  - Si es compra de otros materiales, suministros, repuestos, útiles, ferretería, materiales de construcción u otros productos no clasificados arriba: "90003"
  - Si el emisor/proveedor es restaurante, comida rápida, cafetería, panadería, comedor o venta de alimentos, clasifica sus líneas como comida o bebida: "90012", salvo que claramente sean productos no alimenticios.

Reglas para totales:
- DocTotal debe ser el total final pagado del documento.
- Si existen subtotal, IVA y total, toma como DocTotal el total final pagado.
- DocTotal, LineTotal y SumLineTotal deben devolverse como número, no como string.
- Cantidad debe devolverse como número, no como string.
- SumLineTotal debe ser exactamente la suma aritmética de todos los Details[].LineTotal, redondeada a 2 decimales.
- Antes de responder, verifica que Details incluya todas las líneas visibles necesarias para que SumLineTotal coincida con DocTotal.
- Antes de responder, verifica que las cantidades, precios unitarios y totales de línea cuadren con el total del documento.
- Si SumLineTotal no coincide con DocTotal, revisa nuevamente la factura y busca líneas omitidas, cantidades mayores a 1, descuentos o totales de línea mal leídos.
- Si después de revisar no puedes lograr que SumLineTotal coincida con DocTotal, conserva DocTotal como el total final visible del documento y conserva SumLineTotal como la suma real de las líneas que sí pudiste identificar.

Equivalencias importantes:
- Aunque el usuario mencione "DocumentLines", en la respuesta usa siempre la propiedad "Details".
- Aunque el usuario mencione "ItemDescription", en la respuesta usa siempre la propiedad "Description".
- Aunque el usuario mencione "DocDate", en la respuesta incluye DocDate, pero también incluye Fecha con el mismo valor.
`;

async function procesarFacturaConGemini(filePath, mimeType) {
    const fileBuffer = fs.readFileSync(filePath);
    const base64File = fileBuffer.toString('base64');

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
    });

    const result = await model.generateContent([
        {
            inlineData: {
                mimeType,
                data: base64File,
            },
        },
        PROMPT_FACTURA,
    ]);

    const response = await result.response;
    let text = response.text();

    text = text
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

    return text;
}

module.exports = {
    procesarFacturaConGemini,
    PROMPT_FACTURA,
};
