/*
 * Connect all of your endpoints together here.
 */
const express = require('express');

module.exports = (app, _sharedRouterFromServerJs) => {
    app.use('/api', require('./home')(express.Router()));

    app.use('/api/users', require('./users')(express.Router()));

    app.use('/api/tasks', require('./tasks')(express.Router()));
};
