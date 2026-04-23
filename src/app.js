const express = require('express');
const cors = require('cors');
const facturaRoutes = require('./routes/factura.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/facturas', facturaRoutes);

module.exports = app;