document.addEventListener('DOMContentLoaded', () => {
    const deviceList = document.getElementById('device-list');
    const scriptList = document.getElementById('script-list');
    const selectDevice = document.querySelector('.system-monitoring-controls select');
    const outputConsole = document.getElementById('output-console');

    const proxyUrl = 'http://localhost:3000';

    // --- Helper Functions ---
    function logToConsole(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.classList.add('log-entry', `log-${type}`);
        logEntry.innerHTML = `<span class="timestamp">${timestamp}</span>${message}`;
        outputConsole.appendChild(logEntry);
        outputConsole.scrollTop = outputConsole.scrollHeight; // Auto-scroll
    }

    const handleSelection = (list, event) => {
        const item = event.target;
        if (item.tagName === 'LI') {
            if (!event.ctrlKey) {
                const selectedItems = list.querySelectorAll('.selected');
                selectedItems.forEach(selected => selected.classList.remove('selected'));
            }
            item.classList.toggle('selected');
        }
    };

    // --- Salt API Functions ---

    async function fetchAvailableDevices() {
        logToConsole('Fetching available devices...');
        try {
            const response = await fetch(`${proxyUrl}/proxy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    client: 'local',
                    tgt: '*',
                    fun: 'test.ping'
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API request failed: ${errorData.message || response.statusText}`);
            }

            const data = await response.json();

            // Log the raw response to see its structure
            logToConsole(`Raw API Response (Devices): <pre>${JSON.stringify(data, null, 2)}</pre>`, 'info');

            const minions = (data.return && typeof data.return[0] === 'object' && data.return[0] !== null) ? data.return[0] : {};
            const activeMinions = Object.keys(minions).filter(minion => minions[minion]);

            logToConsole(`Found ${activeMinions.length} active minions.`, 'info');

            updateDeviceList(activeMinions); // Only show minions that returned true
            logToConsole('Successfully fetched and updated device list.', 'success');

            if (activeMinions.length > 0) {
                fetchAvailableScripts(activeMinions[0]); // Fetch scripts from the first minion
            }
        } catch (error) {
            console.error('Fetch Devices Error:', error);
            logToConsole(`Error fetching devices: ${error.message}`, 'error');
        }
    }

    async function fetchAvailableScripts(minionId) {
        logToConsole(`Fetching available scripts from ${minionId}...`);
        try {
            const response = await fetch(`${proxyUrl}/proxy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client: 'local',
                    tgt: minionId,
                    fun: 'sys.list_functions'
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API request failed: ${errorData.message || 'Error proxying request to Salt API'}`);
            }

            const data = await response.json();
            logToConsole(`Raw API Response (Scripts): <pre>${JSON.stringify(data, null, 2)}</pre>`, 'info');

            // The result is nested under 'return', '[0]', and the minionId
            const scripts = data.return && data.return[0] && data.return[0][minionId]
                ? data.return[0][minionId]
                : [];

            if (scripts.length > 0) {
                logToConsole(`Successfully fetched ${scripts.length} scripts.`, 'success');
                updateScriptList(scripts);
            } else {
                logToConsole('No scripts returned from minion.', 'warn');
                updateScriptList([]); // Clear the list
            }

        } catch (error) {
            console.error('Fetch Scripts Error:', error);
            logToConsole(`Error fetching scripts: ${error.message}`, 'error');
        }
    }

    async function deployScripts() {
        const selectedDevices = [...deviceList.querySelectorAll('.selected')].map(item => item.textContent);
        const selectedScripts = [...scriptList.querySelectorAll('.selected')].map(item => item.textContent);

        if (selectedDevices.length === 0) {
            logToConsole('Please select at least one device to deploy to.', 'warn');
            return;
        }

        if (selectedScripts.length === 0) {
            logToConsole('Please select at least one script to deploy.', 'warn');
            return;
        }

        logToConsole(`Deploying ${selectedScripts.join(', ')} to ${selectedDevices.join(', ')}...`, 'info');

        for (const script of selectedScripts) {
            logToConsole(`Executing ${script}...`, 'info');
            try {
                const response = await fetch(`${proxyUrl}/proxy`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        client: 'local',
                        tgt: selectedDevices,
                        tgt_type: 'list',
                        fun: script
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Execution failed: ${errorData.message || response.statusText}`);
                }

                const data = await response.json();
                logToConsole(`Result for ${script}: <pre>${JSON.stringify(data.return[0], null, 2)}</pre>`, 'success');

            } catch (error) {
                console.error(`Error executing ${script}:`, error);
                logToConsole(`Error executing ${script}: ${error.message}`, 'error');
            }
        }
    }

    function updateDeviceList(devices) {
        deviceList.innerHTML = ''; // Clear existing list
        selectDevice.innerHTML = '<option>Select a device</option>'; // Clear and reset dropdown

        if (devices.length === 0) {
            logToConsole('No active devices found.', 'warn');
            const li = document.createElement('li');
            li.textContent = 'No active devices found';
            li.classList.add('disabled');
            deviceList.appendChild(li);
            return;
        }

        devices.forEach(deviceName => {
            // Add to "Available Devices" list
            const li = document.createElement('li');
            li.textContent = deviceName;
            deviceList.appendChild(li);

            // Add to "System Monitoring" dropdown
            const option = document.createElement('option');
            option.text = deviceName;
            selectDevice.add(option);
        });
    }

    function updateScriptList(scripts) {
        scriptList.innerHTML = ''; // Clear existing list

        if (scripts.length === 0) {
            logToConsole('No scripts found.', 'warn');
            const li = document.createElement('li');
            li.textContent = 'No scripts found';
            li.classList.add('disabled');
            scriptList.appendChild(li);
            return;
        }

        scripts.forEach(scriptName => {
            const li = document.createElement('li');
            li.textContent = scriptName;
            scriptList.appendChild(li);
        });
    }


    // --- Event Listeners ---

    deviceList.addEventListener('click', (event) => handleSelection(deviceList, event));
    scriptList.addEventListener('click', (event) => handleSelection(scriptList, event));

    document.querySelector('.btn-deploy').addEventListener('click', () => {
        logToConsole('Deploy button clicked.');
        deployScripts();
    });
    
    document.querySelector('.btn-refresh').addEventListener('click', () => {
        logToConsole('Refresh button clicked.');
        fetchAvailableDevices();
    });

    const scriptSearch = document.getElementById('script-search');
    scriptSearch.addEventListener('input', () => {
        const searchTerm = scriptSearch.value.toLowerCase();
        const scripts = scriptList.getElementsByTagName('li');
        for (const script of scripts) {
            const scriptName = script.textContent.toLowerCase();
            if (scriptName.includes(searchTerm)) {
                script.style.display = '';
            } else {
                script.style.display = 'none';
            }
        }
    });

    // --- Initial Load ---
    fetchAvailableDevices();
});