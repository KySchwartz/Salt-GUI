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

// Route to get custom scripts from the salt-master
app.get('/custom-scripts', async (req, res) => {
    const payload = {
        client: 'runner',
        fun: 'fileserver.file_list',
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
        // The return is a list of files
        const scripts = response.data.return[0];
        res.json(scripts);
    } catch (error) {
        console.error('Error fetching custom scripts:', error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({
            message: 'Error fetching custom scripts from Salt API',
            error: error.response ? error.response.data : error.message
        });
    }
});


// Route to list all minion keys
app.get('/keys', async (req, res) => {
    const payload = {
        client: 'wheel',
        fun: 'key.list_all',
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
        console.error('Error fetching keys:', error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({
            message: 'Error fetching keys from Salt API',
            error: error.response ? error.response.data : error.message
        });
    }
});

// Route to accept a minion key
app.post('/keys/accept', async (req, res) => {
    const { minionId } = req.body;

    if (!minionId) {
        return res.status(400).json({ message: 'minionId is required' });
    }

    const payload = {
        client: 'wheel',
        fun: 'key.accept',
        match: minionId,
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
        console.error(`Error accepting key for minion ${minionId}:`, error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({
            message: `Error accepting key for minion ${minionId} from Salt API`,
            error: error.response ? error.response.data : error.message
        });
    }
});

// Route to delete a minion key
app.post('/keys/delete', async (req, res) => {
    const { minionId } = req.body;

    if (!minionId) {
        return res.status(400).json({ message: 'minionId is required' });
    }

    const payload = {
        client: 'wheel',
        fun: 'key.delete',
        match: minionId,
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
        console.error(`Error deleting key for minion ${minionId}:`, error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({
            message: `Error deleting key for minion ${minionId} from Salt API`,
            error: error.response ? error.response.data : error.message
        });
    }
});

app.listen(port, () => {
    console.log(`Salt API proxy server listening at http://localhost:${port}`);
});