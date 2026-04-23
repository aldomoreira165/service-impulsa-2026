const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const PROMPT_FACTURA = `
Analiza la imagen o PDF de una factura guatemalteca y devuelve ÚNICAMENTE un JSON válido, sin explicaciones, sin texto adicional, sin bloques markdown y sin comentarios.

La estructura del JSON debe ser EXACTAMENTE esta:

{
  "Fecha": "YYYY-MM-DD o null",
  "FechaOriginal": "string o null",
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
  "DocTotal": 0
}

Extrae los siguientes campos:
- FechaOriginal: fecha tal como aparece escrita en la factura.
- Fecha: fecha del documento convertida a formato YYYY-MM-DD.
- Si la fecha visible está en formato DD/MM/YYYY, interprétala SIEMPRE como día/mes/año.
- Ejemplo: 03/04/2026 significa 2026-04-03.
- No uses formato MM/DD/YYYY.
- U_DoctoNo: número de factura o número de documento.
- U_DoctoSerie: serie de la factura o serie del documento.
- U_D_UUID: autorización, firma electrónica, UUID o número de autorización electrónica.
- U_Nit: NIT del emisor o proveedor.
- U_Nombre: nombre del emisor o proveedor.
- DocTotal: total final del documento.

También debes extraer el detalle de la factura en el arreglo "Details".

Reglas para "Details":
- Cada línea o producto de la factura debe convertirse en un objeto independiente dentro del arreglo.
- No agrupes productos o servicios.
- Description: descripción exacta o lo más cercana posible del producto o servicio.
- LineTotal: total monetario de esa línea.
- Cantidad: cantidad de la línea. Si no aparece claramente, devuelve 1.
- ItemCode: clasifica cada línea según su tipo, usando estos códigos:
  - Si es comida o bebida: "90012"
  - Si es hospedaje o servicios hoteleros: "90023"
  - Si son herramientas: "90007"
  - Si es compra de otros materiales: "90003"

Reglas importantes:
- No inventes datos.
- Si un campo no aparece claramente, devuelve null.
- Si no hay detalles identificables, devuelve "Details": [].
- DocTotal y LineTotal deben devolverse como número, no como string.
- Cantidad debe devolverse como número, no como string.
- Respeta exactamente los nombres de las propiedades.
- Si existen subtotal, IVA y total, toma como DocTotal el total final pagado.
- Si hay varias fechas, usa la fecha de emisión del documento.
- Si hay varios NIT, usa el NIT del emisor o proveedor, no el del comprador.
- La respuesta debe ser JSON parseable con JSON.parse().
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