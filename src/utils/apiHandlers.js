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

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) {
        const [dd, mm, yyyy] = valor.split('/');
        return `${yyyy}-${mm}-${dd}`;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        return valor;
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