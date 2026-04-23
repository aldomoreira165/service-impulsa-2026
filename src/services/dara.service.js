const { api, manejarErrorAxios, getAuthHeaders } = require("../utils/apiHandlers");

const login = async () => {
    try {
        const response = await api.post("usuarios/accesar2", {
            NombreUsuario: process.env.DARA_USER,
            Autoken: Number(process.env.DARA_AUTOKEN),
        });

        const { data } = response;

        if (!data) {
            throw new Error("Respuesta vacía de DARA");
        }

        if (!data?.data?.token) {
            console.log("Respuesta completa de login DARA:", data);
            throw new Error("No se encontró token en la respuesta de DARA");
        }

        return data.data.token;
    } catch (error) {
        manejarErrorAxios(error, "Error al autenticar con DARA");
    }
};

const obtenerInformacionNit = async ({ token, nit }) => {
    try {
        const response = await api.get("caja-chica2/liquidacion/obtener-informacion-nit", {
            params: { NIT: nit },
            headers: {
                ...getAuthHeaders(token),
            },
        });

        const { data } = response;

        if (!data) {
            throw new Error("Respuesta vacía al consultar NIT");
        }

        if (data.MensajeError) {
            throw new Error(data.MensajeError);
        }

        return data;
    } catch (error) {
        manejarErrorAxios(error, "Error al consultar proveedor por NIT");
    }
};

const crearDocumento = async ({ token, payload }) => {
    try {
        const response = await api.post(
            "caja-chica2/liquidacion-documento/crear",
            payload,
            {
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeaders(token),
                },
            }
        );

        const { data } = response;

        if (!data) {
            throw new Error("Respuesta vacía al crear documento");
        }

        if (data.MensajeError) {
            throw new Error(data.MensajeError);
        }

        return data;
    } catch (error) {
        manejarErrorAxios(error, "Error al crear documento en DARA");
    }
};

const obtenerDimensionesEmpresa = async ({ token, empresaId }) => {
    try {
        const response = await api.get(
            `caja-chica2/liquidacion/listar-dimensiones/${empresaId}`,
            {
                headers: {
                    ...getAuthHeaders(token),
                },
            }
        );

        const { data } = response;

        if (!data) {
            throw new Error('Respuesta vacía al listar dimensiones');
        }

        if (data.MensajeError) {
            throw new Error(data.MensajeError);
        }

        return Array.isArray(data) ? data : [];
    } catch (error) {
        manejarErrorAxios(error, 'Error al obtener dimensiones de la empresa');
    }
};

module.exports = {
    login,
    obtenerInformacionNit,
    crearDocumento,
    obtenerDimensionesEmpresa,
};