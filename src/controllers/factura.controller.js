const fs = require('fs');
const { procesarFacturaConGemini } = require('../services/gemini.service');
const { extractJsonFromText } = require('../utils/extractJson');
const { login, obtenerInformacionNit, crearDocumento, obtenerDimensionesEmpresa } = require('../services/dara.service');
const { normalizarFecha, subirArchivoDocumento } = require('../utils/apiHandlers');

const CONFIG_INICIAL = {
    LiquidacionID: 1763,
    CajaChicaID: 47,
    EmpresaID: 1,
    TipoDocumentoCajaChicaID: 1,
    TipoCompraVentaID: 1,
    tipoimpuesto: 'IVA',
    CentroCostoID: 0,
    Observaciones: 'Carga automática desde chatbot',
    Justificacion: 'Procesado automáticamente por chatbot',
    ForzarSinDimensiones: true,
    DimensionesEmpresa: null,
    articulo: '',
    ArticuloID: '',
    Dimension1: null,
    Dimension2: null,
    Dimension3: null,
    Dimension4: null,
    Dimension5: null,
};

const construirDetalles = ({
    details,
    dimensionesEmpresa,
    articulo,
    articuloId,
    tipoCompraVentaId,
    tipoImpuesto,
    centroCostoId,
    dimensiones,
}) => {
    return details.map((item, index) => {
        const monto = Number(item.LineTotal || 0);
        const cantidad = Number(item.Cantidad || 1);
        const montoUnitario = cantidad > 0
            ? Number((monto / cantidad).toFixed(5))
            : Number(monto.toFixed(5));

        const base = {
            Descripcion: item.Description || `Línea ${index + 1}`,
            TipoCompraVentaID: Number(tipoCompraVentaId),
            tipoimpuesto: tipoImpuesto || 'IVA',
            monto,
            Cantidad: cantidad,
            MontoUnitario: montoUnitario,
            CentroCostoID: Number(centroCostoId || 0),
            LineNum: index,
            TieneIDP: false,
            TieneINGUAT: false,
            MontoIDP: null,
            MontoINGUAT: null,
            Code: '',
        };

        if (Array.isArray(dimensionesEmpresa) && dimensionesEmpresa.length > 0) {
            return {
                ...base,
                ArticuloID: Number(articuloId),
                Dimension1: dimensiones.Dimension1 ?? null,
                Dimension2: dimensiones.Dimension2 ?? null,
                Dimension3: dimensiones.Dimension3 ?? null,
                Dimension4: dimensiones.Dimension4 ?? null,
                Dimension5: dimensiones.Dimension5 ?? null,
            };
        }

        return {
            ...base,
            articulo: item.ItemCode,
        };
    });
};

async function procesarFactura(req, res) {
    let filePath = null;

    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Debes enviar un archivo en el campo "file".',
            });
        }

        filePath = req.file.path;

        const config = {
            ...CONFIG_INICIAL,
        };

        if (!config.LiquidacionID) {
            return res.status(400).json({
                success: false,
                message: 'CONFIG_INICIAL no tiene LiquidacionID.',
            });
        }

        if (!config.EmpresaID) {
            return res.status(400).json({
                success: false,
                message: 'CONFIG_INICIAL no tiene EmpresaID.',
            });
        }

        if (!config.TipoCompraVentaID) {
            return res.status(400).json({
                success: false,
                message: 'CONFIG_INICIAL no tiene TipoCompraVentaID.',
            });
        }

        const rawResponse = await procesarFacturaConGemini(
            req.file.path,
            req.file.mimetype
        );

        const cleanedText = extractJsonFromText(rawResponse);

        let parsedJson;

        try {
            parsedJson = JSON.parse(cleanedText);
        } catch {
            return res.status(422).json({
                success: false,
                message: 'La IA no devolvió un JSON válido.',
                rawResponse,
            });
        }

        if (!parsedJson?.U_DoctoSerie || !parsedJson?.U_DoctoNo) {
            return res.status(422).json({
                success: false,
                message: 'La IA no devolvió Serie y Número correctamente.',
                data: parsedJson,
            });
        }

        if (!parsedJson?.U_Nit) {
            return res.status(422).json({
                success: false,
                message: 'La IA no devolvió NIT.',
                data: parsedJson,
            });
        }

        if (!parsedJson?.DocTotal || Number(parsedJson.DocTotal) <= 0) {
            return res.status(422).json({
                success: false,
                message: 'La IA no devolvió un total válido.',
                data: parsedJson,
            });
        }

        if (!Array.isArray(parsedJson?.Details) || parsedJson.Details.length === 0) {
            return res.status(422).json({
                success: false,
                message: 'La IA no devolvió detalles del documento.',
                data: parsedJson,
            });
        }

        const fechaNormalizada = normalizarFecha(
            parsedJson.FechaOriginal || parsedJson.Fecha
        );

        if (!fechaNormalizada) {
            return res.status(422).json({
                success: false,
                message: 'La IA no devolvió una fecha válida.',
                data: parsedJson,
            });
        }

        const sumaDetalles = parsedJson.Details.reduce(
            (acc, item) => acc + Number(item.LineTotal || 0),
            0
        );

        const diferencia = Math.abs(Number(parsedJson.DocTotal) - sumaDetalles);

        if (diferencia > 0.01) {
            return res.status(422).json({
                success: false,
                message: 'La suma de los detalles no coincide con el total del documento.',
                data: parsedJson,
            });
        }

        const token = await login();

        const dimensionesEmpresa = await obtenerDimensionesEmpresa({
            token,
            empresaId: config.EmpresaID,
        });

        config.DimensionesEmpresa = config.ForzarSinDimensiones ? [] : dimensionesEmpresa;

        if (
            Array.isArray(config.DimensionesEmpresa) &&
            config.DimensionesEmpresa.length > 0 &&
            !config.ArticuloID
        ) {
            return res.status(400).json({
                success: false,
                message: 'Esta configuración requiere ArticuloID porque maneja dimensiones.',
            });
        }

        if (
            (!config.DimensionesEmpresa || config.DimensionesEmpresa.length === 0) &&
            parsedJson.Details.some((item) => !item.ItemCode)
        ) {
            return res.status(422).json({
                success: false,
                message: 'La IA no devolvió ItemCode en uno o más detalles.',
                data: parsedJson,
            });
        }

        const imagen = await subirArchivoDocumento({
            token,
            filePath: req.file.path,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
        });

        const proveedorInfo = await obtenerInformacionNit({
            token,
            nit: parsedJson.U_Nit,
        });

        if (!proveedorInfo?.ProveedorID) {
            return res.status(422).json({
                success: false,
                message: `No se encontró ProveedorID para el NIT ${parsedJson.U_Nit} en DARA.`,
                proveedorInfo,
            });
        }

        const payloadDara = {
            LiquidacionID: Number(config.LiquidacionID),
            CajaChicaID: config.CajaChicaID ? Number(config.CajaChicaID) : '',
            Liquidacion: {
                LiquidacionID: Number(config.LiquidacionID),
                CajaChicaID: config.CajaChicaID ? Number(config.CajaChicaID) : '',
                Observaciones: config.Observaciones,
            },
            Serie: `${parsedJson.U_DoctoSerie}`.toUpperCase(),
            Numero: parsedJson.U_DoctoNo,
            Fecha: fechaNormalizada,
            ProveedorID: Number(proveedorInfo.ProveedorID),
            ProveedorNuevo: false,
            Proveedor: {
                ProveedorID: Number(proveedorInfo.ProveedorID),
                Nombre: parsedJson.U_Nombre || '',
                NIT: parsedJson.U_Nit,
            },
            NIT: parsedJson.U_Nit,
            imagen,
            Justificacion: config.Justificacion,
            total: Number(parsedJson.DocTotal),
            EmpresaID: Number(config.EmpresaID),
            TipoDocumentoCajaChicaID: Number(config.TipoDocumentoCajaChicaID),
            DimensionesEmpresa: config.DimensionesEmpresa,
            DocumentoDetalles: construirDetalles({
                details: parsedJson.Details,
                dimensionesEmpresa: config.DimensionesEmpresa,
                articulo: config.articulo,
                articuloId: config.ArticuloID,
                tipoCompraVentaId: config.TipoCompraVentaID,
                tipoImpuesto: config.tipoimpuesto,
                centroCostoId: config.CentroCostoID,
                dimensiones: {
                    Dimension1: config.Dimension1,
                    Dimension2: config.Dimension2,
                    Dimension3: config.Dimension3,
                    Dimension4: config.Dimension4,
                    Dimension5: config.Dimension5,
                },
            }),
        };

        const documentoCreado = await crearDocumento({
            token,
            payload: payloadDara,
        });

        return res.status(200).json({
            success: true,
            message: 'Factura procesada y creada en DARA correctamente.',
        });
    } catch (error) {
        console.error('Error al procesar factura:', error);

        return res.status(500).json({
            success: false,
            message: 'Ocurrió un error interno al procesar la factura.',
            error: error.message,
        });
    } finally {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}

module.exports = { procesarFactura };