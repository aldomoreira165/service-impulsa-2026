require('dotenv').config();
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { default: axios } = require('axios');

const BASE_URL = (process.env.DARA_URL_BASE || '').replace(/\]+$/, '');

const api = axios.create({
    baseURL: BASE_URL,
    timeout: 20000,
});

const getAuthHeaders = (token) => {
    return {
        Authorization: `Bearer ${token}`,
    };
};

const manejarErrorAxios = (error, mensajeBase = 'Error en DARA') => {
    if (error.response) {
        const mensaje =
            error.response.data?.MensajeError ||
            error.response.data?.mensaje ||
            error.response.data?.message ||
            `${mensajeBase}: ${error.response.status}`;

        throw new Error(mensaje);
    }

    if (error.request) {
        throw new Error(`${mensajeBase}: DARA no respondió`);
    }

    throw new Error(error.message || mensajeBase);
};

const subirArchivoDocumento = async ({ token, filePath, originalName, mimeType }) => {
    try {
        const form = new FormData();

        form.append('file', fs.createReadStream(filePath), {
            filename: originalName || path.basename(filePath),
            contentType: mimeType,
        });

        const response = await api.post(
            'caja-chica2/liquidacion-documento/send-files',
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    ...getAuthHeaders(token),
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            }
        );

        const { data } = response;

        if (!data) {
            throw new Error('Respuesta vacía al subir archivo');
        }

        if (data.MensajeError) {
            throw new Error(data.MensajeError);
        }

        if (!data.urlFiles) {
            console.log('Respuesta upload DARA:', data);
            throw new Error('DARA no devolvió urlFiles');
        }

        return data.urlFiles;
    } catch (error) {
        manejarErrorAxios(error, 'Error al subir archivo a DARA');
    }
};

const parseJsonField = (value, defaultValue) => {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }

    if (typeof value === 'object') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return defaultValue;
    }
};

const normalizarFecha = (valor) => {
    if (!valor) return null;

    const texto = `${valor}`.trim().toLowerCase();

    const yyyyMmDd = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (yyyyMmDd) {
        const [, yyyy, mm, dd] = yyyyMmDd;
        return `${yyyy}-${mm}-${dd}`;
    }

    const ddMmYyyy = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (ddMmYyyy) {
        const [, dd, mm, yyyy] = ddMmYyyy;
        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }

    const meses = {
        ene: '01',
        enero: '01',
        feb: '02',
        febrero: '02',
        mar: '03',
        marzo: '03',
        abr: '04',
        abril: '04',
        may: '05',
        mayo: '05',
        jun: '06',
        junio: '06',
        jul: '07',
        julio: '07',
        ago: '08',
        agosto: '08',
        sep: '09',
        sept: '09',
        septiembre: '09',
        oct: '10',
        octubre: '10',
        nov: '11',
        noviembre: '11',
        dic: '12',
        diciembre: '12',
    };

    const fechaConMesTexto = texto.match(
        /^(\d{1,2})(?:\s*[-\/]\s*|\s+de\s+|\s+)([a-záéíóúñ]+)(?:\s*[-\/]\s*|\s+de\s+|\s+)(\d{4})/
    );

    if (fechaConMesTexto) {
        const [, dd, mesTexto, yyyy] = fechaConMesTexto;
        const mesNormalizado = mesTexto
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        const mm = meses[mesNormalizado];

        if (!mm) return null;

        return `${yyyy}-${mm}-${dd.padStart(2, '0')}`;
    }

    return null;
};

module.exports = {
    BASE_URL,
    api,
    getAuthHeaders,
    manejarErrorAxios,
    subirArchivoDocumento,
    parseJsonField,
    normalizarFecha,
};