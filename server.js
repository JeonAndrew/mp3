// Get the packages we need
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    bodyParser = require('body-parser');

// Read .env file
require('dotenv').config();

// Create our Express application
var app = express();

// Use environment defined port or 3000
var port = process.env.PORT || 3000;

// Connect to a MongoDB --> Uncomment this once you have a connection string!!
mongoose.connect(process.env.MONGODB_URI,  { useNewUrlParser: true });
mongoose.connection.on('connected', () => {
    console.log('Connected to MongoDB Atlas');
});
mongoose.connection.on('error', err => {
    console.error('Connection error:', err);
});

// Allow CORS so that backend and frontend could be put on different servers
var allowCrossDomain = function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
    next();
};
app.use(allowCrossDomain);

// Use the body-parser package in our application
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

// Use routes as a module (see index.js)
require('./routes')(app, router);

// 404 for unknown routes
app.use((req, res) => {
    res.status(404).json({ message: 'Not found', data: {} });
});
  
// Central error handler
app.use((err, req, res, next) => {
    console.error(err);

    let status = 500;
    let message = 'Server error';

    if (err instanceof SyntaxError && 'body' in err) {
        status = 400;
        message = 'Malformed JSON body';
    } else if (err.name === 'CastError') {
        status = 400;
        message = 'Invalid id';
    } else if (err.name === 'ValidationError') {
        status = 400;
        message = 'Invalid input';
    } else if (err.code === 11000 || err.code === 'E11000') {
        status = 400;
        message = 'Duplicate key error';
    }

    res.status(status).json({ message, data: {} });
});

// Start the server
app.listen(port);
console.log('Server running on port ' + port);
