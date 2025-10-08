
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware to parse JSON bodies and enable CORS
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from the current directory

const saltApiUrl = 'https://salt80.soc-se.org/salt-api'; // Using https as is standard

// Proxy route for Salt API commands using tokenless authentication
app.post('/proxy', async (req, res) => {
    const saltCommand = req.body;

    // Combine the command with authentication credentials
    const payload = {
        ...saltCommand,
        username: 'sysadmin',
        password: 'Changeme1!',
        eauth: 'pam'
    };

    try {
        const response = await axios.post(`${saltApiUrl}/run`, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Salt API Proxy Error:', error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({
            message: 'Error proxying request to Salt API',
            error: error.response ? error.response.data : error.message
        });
    }
});

app.listen(port, () => {
    console.log(`Salt API proxy server listening at http://localhost:${port}`);
});
