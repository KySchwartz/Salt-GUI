document.addEventListener('DOMContentLoaded', () => {
    const deviceList = document.getElementById('device-list');
    const scriptList = document.getElementById('script-list');
    const selectDevice = document.querySelector('.system-monitoring-controls select');
    const outputConsole = document.getElementById('output-console');
    const scriptArgsContainer = document.getElementById('script-args-container');
    const scriptTypeSelector = document.getElementById('script-type-selector');


    const proxyUrl = 'http://localhost:3000';
    let currentArgSpec = null; // Variable to cache the argspec

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
        if (item.tagName !== 'LI') return;

        if (list.id === 'device-list') {
            // Device list multi-select with Ctrl key
            if (!event.ctrlKey) {
                const selectedItems = list.querySelectorAll('.selected');
                selectedItems.forEach(selected => selected.classList.remove('selected'));
            }
            item.classList.toggle('selected');
        } else if (list.id === 'script-list') {
            // Script list multi-select with Ctrl key
            if (!event.ctrlKey) {
                const selectedItems = list.querySelectorAll('.selected');
                selectedItems.forEach(selected => selected.classList.remove('selected'));
            }
            item.classList.toggle('selected');

            const selectedScripts = list.querySelectorAll('.selected');
            const scriptType = document.querySelector('input[name="script-type"]:checked').value;

            if (selectedScripts.length > 1) {
                // Multiple scripts selected, clear and hide args
                scriptArgsContainer.innerHTML = '';
                scriptArgsContainer.style.display = 'none';
                currentArgSpec = null;
            } else if (selectedScripts.length === 1) {
                // Single script selected
                scriptArgsContainer.style.display = 'block';
                if (scriptType === 'salt') {
                    displayScriptArguments(selectedScripts[0].textContent);
                } else {
                    // For custom scripts, clear the arguments section
                    scriptArgsContainer.innerHTML = '';
                    currentArgSpec = null;
                }
            } else {
                // No scripts selected
                scriptArgsContainer.innerHTML = '';
                scriptArgsContainer.style.display = 'block';
                currentArgSpec = null;
            }
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
                    fun: 'grains.item',
                    arg: ['os']
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API request failed: ${errorData.message || response.statusText}`);
            }

            const data = await response.json();
            const minions = (data.return && typeof data.return[0] === 'object' && data.return[0] !== null) ? data.return[0] : {};
            const activeMinions = Object.keys(minions);
            const minionCounter = document.querySelector('.minion-counter');
            minionCounter.textContent = `Devices Connected: ${activeMinions.length}`;

            logToConsole(`Found ${activeMinions.length} active minions.`, 'info');
            updateDeviceList(minions);
            logToConsole('Successfully fetched and updated device list.', 'success');

            if (activeMinions.length > 0) {
                // Fetch scripts based on the selected script type
                const scriptType = document.querySelector('input[name="script-type"]:checked').value;
                if (scriptType === 'salt') {
                    fetchAvailableScripts(activeMinions[0]);
                } else {
                    fetchCustomScripts();
                }
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

            if (!response.ok) throw new Error('API request to fetch scripts failed');

            const data = await response.json();
            const scripts = data.return && data.return[0] && data.return[0][minionId] ? data.return[0][minionId] : [];

            if (scripts.length > 0) {
                logToConsole(`Successfully fetched ${scripts.length} scripts.`, 'success');
                updateScriptList(scripts);
            } else {
                logToConsole('No scripts returned from minion.', 'warn');
                updateScriptList([]);
            }
        } catch (error) {
            console.error('Fetch Scripts Error:', error);
            logToConsole(`Error fetching scripts: ${error.message}`, 'error');
        }
    }

    async function fetchCustomScripts() {
        logToConsole('Fetching custom scripts...');
        try {
            const response = await fetch(`${proxyUrl}/custom-scripts`);
            if (!response.ok) {
                throw new Error('API request to fetch custom scripts failed');
            }
            const scripts = await response.json();
            if (scripts.length > 0) {
                logToConsole(`Successfully fetched ${scripts.length} custom scripts.`, 'success');
                updateScriptList(scripts);
            } else {
                logToConsole('No custom scripts found.', 'warn');
                updateScriptList([]);
            }
        } catch (error) {
            console.error('Fetch Custom Scripts Error:', error);
            logToConsole(`Error fetching custom scripts: ${error.message}`, 'error');
        }
    }

    async function displayScriptArguments(scriptName) {
        scriptArgsContainer.innerHTML = ''; // Clear previous arguments
        currentArgSpec = null; // Reset cached argspec
        const firstDevice = deviceList.querySelector('li:not(.disabled)');
        if (!firstDevice) {
            logToConsole('Please ensure at least one device is available to fetch script documentation.', 'warn');
            return;
        }
        const minionId = firstDevice.dataset.deviceName;

        logToConsole(`Fetching arguments for ${scriptName} using sys.argspec...`);
        try {
            const response = await fetch(`${proxyUrl}/proxy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client: 'local',
                    tgt: minionId,
                    fun: 'sys.argspec',
                    arg: [scriptName]
                })
            });

            if (!response.ok) throw new Error('Failed to fetch script argspec.');

            const data = await response.json();
            const argspec = data.return[0][minionId][scriptName];
            currentArgSpec = argspec; // Cache the result

            logToConsole(`Raw argspec for ${scriptName}: <pre>${JSON.stringify(argspec, null, 2)}</pre>`);

            let allArgs = [];
            if (argspec && Object.keys(argspec).length > 0) {
                const posArgs = argspec.args || [];
                const keywordArgs = Object.keys(argspec.kwargs || {});
                allArgs = [...posArgs, ...keywordArgs];
                logToConsole(`Successfully parsed arguments from sys.argspec.`, 'success');
            } else {
                logToConsole('sys.argspec returned no data. Falling back to sys.doc parsing...', 'warn');
                await parseArgumentsFromDocstring(scriptName, minionId);
                return;
            }

            const ignoredArgs = new Set(['timeout', 'job_id', 'expr_form', 'tgt_type', 'tgt', 'kwarg', 'fun', 'client', 'arg', 'user', 'password', 'eauth']);
            const filteredArgs = allArgs.filter(argName => argName && !ignoredArgs.has(argName.split('=')[0].trim()));

            if (filteredArgs.length > 0) {
                logToConsole(`Found arguments for ${scriptName}: ${filteredArgs.join(', ')}`, 'info');
                const formHtml = filteredArgs.map(arg => {
                    const isKwarg = (argspec.kwargs && arg in argspec.kwargs);
                    const argName = arg.split('=')[0].trim();
                    const defaultValue = isKwarg ? argspec.kwargs[arg] : '';
                    return `
                        <div class="script-arg-item">
                            <label for="arg-${argName}">${argName} ${isKwarg ? '(optional)' : ''}</label>
                            <input type="text" id="arg-${argName}" name="${argName}" placeholder="${defaultValue || 'Enter value'}">
                        </div>
                    `;
                }).join('');
                scriptArgsContainer.innerHTML = formHtml;
            } else {
                logToConsole(`No user-configurable arguments found for ${scriptName}.`, 'info');
            }

        } catch (error) {
            console.error('Fetch Argspec Error:', error);
            logToConsole(`Error fetching arguments for ${scriptName}: ${error.message}. Trying to parse docstring...`, 'error');
            await parseArgumentsFromDocstring(scriptName, minionId);
        }
    }

    async function parseArgumentsFromDocstring(scriptName, minionId) {
        logToConsole(`Fetching docstring for ${scriptName} to parse arguments...`);
        try {
            const response = await fetch(`${proxyUrl}/proxy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client: 'local',
                    tgt: minionId,
                    fun: 'sys.doc',
                    arg: [scriptName]
                })
            });

            if (!response.ok) throw new Error('Failed to fetch script documentation.');

            const data = await response.json();
            const docstring = data.return[0][minionId][scriptName];

            if (!docstring) {
                logToConsole(`No documentation found for ${scriptName}. Assuming no arguments needed.`, 'info');
                return;
            }

            const paramRegex = /:param(?:\s+\w+)?\s+([^:]+):/g;
            let match;
            const args = [];
            while ((match = paramRegex.exec(docstring)) !== null) {
                if (match.index === paramRegex.lastIndex) paramRegex.lastIndex++;
                args.push(match[1].trim());
            }

            const ignoredArgs = new Set(['timeout', 'job_id', 'expr_form', 'tgt_type', 'tgt', 'kwarg', 'fun', 'client', 'arg', 'user', 'password', 'eauth']);
            const filteredArgs = args.map(arg => arg.split('=')[0].trim()).filter(argName => argName && !ignoredArgs.has(argName));

            if (filteredArgs.length > 0) {
                logToConsole(`Found arguments via docstring for ${scriptName}: ${filteredArgs.join(', ')}`, 'info');
                const formHtml = filteredArgs.map(arg => `
                    <div class="script-arg-item">
                        <label for="arg-${arg}">${arg}</label>
                        <input type="text" id="arg-${arg}" name="${arg}" placeholder="Enter value for ${arg}">
                    </div>
                `).join('');
                scriptArgsContainer.innerHTML = formHtml;
            } else {
                logToConsole(`No user-configurable arguments found in docstring for ${scriptName}.`, 'info');
            }
        } catch (error) {
            console.error('Fetch Doc Error:', error);
            logToConsole(`Error parsing docstring for ${scriptName}: ${error.message}`, 'error');
            scriptArgsContainer.innerHTML = '<p style="color: red;">Could not fetch or parse argument details.</p>';
        }
    }

    async function deployScripts() {
        const selectedDevices = [...deviceList.querySelectorAll('.selected')].map(item => item.dataset.deviceName);
        const selectedScriptItems = [...scriptList.querySelectorAll('.selected')];

        if (selectedDevices.length === 0) {
            logToConsole('Please select at least one device.', 'warn');
            return;
        }

        if (selectedScriptItems.length === 0) {
            logToConsole('Please select at least one script to deploy.', 'warn');
            return;
        }

        for (const scriptItem of selectedScriptItems) {
            const scriptName = scriptItem.textContent;
            const scriptType = document.querySelector('input[name="script-type"]:checked').value;
            
            let payload;

            if (scriptType === 'custom') {
                payload = {
                    client: 'local',
                    tgt: selectedDevices,
                    tgt_type: 'list',
                    fun: 'cmd.script',
                    arg: [`salt://${scriptName}`]
                };
            } else { // 'salt'
                payload = {
                    client: 'local',
                    tgt: selectedDevices,
                    tgt_type: 'list',
                    fun: scriptName,
                };

                // Only add arguments if a single script is selected
                if (selectedScriptItems.length === 1) {
                    const saltArgs = [];
                    const saltKwargs = {};
                    const argInputs = scriptArgsContainer.querySelectorAll('input');

                    argInputs.forEach(input => {
                        if (input.value) {
                            if (currentArgSpec && currentArgSpec.args && currentArgSpec.args.includes(input.name)) {
                                saltArgs.push(input.value);
                            } else {
                                saltKwargs[input.name] = input.value;
                            }
                        }
                    });

                    if (saltArgs.length > 0) {
                        payload.arg = saltArgs;
                    }
                    if (Object.keys(saltKwargs).length > 0) {
                        payload.kwarg = saltKwargs;
                    }
                }
            }

            const kwargString = payload.kwarg ? ` with kwargs: ${JSON.stringify(payload.kwarg)}` : '';
            const argString = payload.arg ? ` with args: ${JSON.stringify(payload.arg)}` : '';
            logToConsole(`Deploying ${scriptName} to ${selectedDevices.join(', ')}${argString}${kwargString}...`, 'info');

            try {
                const response = await fetch(`${proxyUrl}/proxy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Execution failed: ${errorData.message || response.statusText}`);
                }

                const data = await response.json();
                logToConsole(`Result for ${scriptName}: <pre>${JSON.stringify(data.return[0], null, 2)}</pre>`, 'success');
            } catch (error) {
                console.error(`Error executing ${scriptName}:`, error);
                logToConsole(`Error executing ${scriptName}: ${error.message}`, 'error');
            }
        }
    }

    function updateDeviceList(minions) {
        deviceList.innerHTML = '';
        selectDevice.innerHTML = '<option>Select a device</option>';

        const deviceNames = Object.keys(minions);

        if (deviceNames.length === 0) {
            logToConsole('No active devices found.', 'warn');
            const li = document.createElement('li');
            li.textContent = 'No active devices found';
            li.classList.add('disabled');
            deviceList.appendChild(li);
            return;
        }

        deviceNames.forEach(deviceName => {
            const os = minions[deviceName] && minions[deviceName]['os'] ? minions[deviceName]['os'] : 'N/A';
            const displayName = `${deviceName} (${os})`;

            const li = document.createElement('li');
            li.textContent = displayName;
            li.dataset.deviceName = deviceName;
            deviceList.appendChild(li);
            
            const option = document.createElement('option');
            option.text = displayName;
            option.value = deviceName;
            selectDevice.add(option);
        });
    }

    function updateScriptList(scripts) {
        scriptList.innerHTML = '';

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

    document.querySelector('.btn-deploy').addEventListener('click', deployScripts);
    document.querySelector('.btn-refresh').addEventListener('click', fetchAvailableDevices);

    scriptTypeSelector.addEventListener('change', (event) => {
        const scriptType = event.target.value;
        scriptArgsContainer.innerHTML = ''; // Clear args on switch
        currentArgSpec = null;
        updateScriptList([]); // Clear script list while loading

        if (scriptType === 'salt') {
            const firstDevice = deviceList.querySelector('li:not(.disabled)');
            if (firstDevice) {
                fetchAvailableScripts(firstDevice.dataset.deviceName);
            } else {
                logToConsole('Select a device to fetch Salt scripts.', 'warn');
            }
        } else if (scriptType === 'custom') {
            fetchCustomScripts();
        }
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

    const connectDeviceModal = document.getElementById('connect-device-modal');
    const closeButton = document.querySelector('.close-button');
    const unacceptedKeysList = document.getElementById('unaccepted-keys-list');
    const acceptedKeysList = document.getElementById('accepted-keys-list');
    const modalContent = document.querySelector('.modal-content');

    async function openConnectDeviceModal() {
        logToConsole('Fetching keys...');
        try {
            const response = await fetch(`${proxyUrl}/keys`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(JSON.stringify(errorData.error));
            }
            const data = await response.json();
            const keys = data.return[0].data.return;
            const unacceptedKeys = keys.minions_pre;
            const acceptedKeys = keys.minions;

            unacceptedKeysList.innerHTML = ''; // Clear previous list
            acceptedKeysList.innerHTML = ''; // Clear previous list

            if (unacceptedKeys.length > 0) {
                unacceptedKeys.forEach(key => {
                    const li = document.createElement('li');
                    li.textContent = key;
                    const acceptButton = document.createElement('button');
                    acceptButton.textContent = 'Accept';
                    acceptButton.classList.add('btn', 'btn-accept');
                    acceptButton.dataset.minionId = key;
                    li.appendChild(acceptButton);
                    unacceptedKeysList.appendChild(li);
                });
            } else {
                const li = document.createElement('li');
                li.textContent = 'No devices awaiting acceptance.';
                unacceptedKeysList.appendChild(li);
            }

            if (acceptedKeys.length > 0) {
                acceptedKeys.forEach(key => {
                    const li = document.createElement('li');
                    li.textContent = key;
                    const removeButton = document.createElement('button');
                    removeButton.textContent = 'Remove';
                    removeButton.classList.add('btn', 'btn-remove');
                    removeButton.dataset.minionId = key;
                    li.appendChild(removeButton);
                    acceptedKeysList.appendChild(li);
                });
            } else {
                const li = document.createElement('li');
                li.textContent = 'No accepted devices found.';
                acceptedKeysList.appendChild(li);
            }

            connectDeviceModal.style.display = 'block';
        } catch (error) {
            console.error('Error fetching keys:', error);
            logToConsole(`Error fetching keys: ${error.message}`, 'error');
        }
    }

    function closeConnectDeviceModal() {
        connectDeviceModal.style.display = 'none';
    }

    async function acceptKey(minionId) {
        logToConsole(`Accepting key for ${minionId}...`);
        try {
            const response = await fetch(`${proxyUrl}/keys/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ minionId })
            });

            if (!response.ok) {
                throw new Error(`Failed to accept key for ${minionId}.`);
            }

            logToConsole(`Successfully accepted key for ${minionId}.`, 'success');
            openConnectDeviceModal(); // Refresh the modal
            fetchAvailableDevices(); // Refresh the main device list
        } catch (error) {
            console.error('Error accepting key:', error);
            logToConsole(`Error accepting key for ${minionId}: ${error.message}`, 'error');
        }
    }

    async function removeKey(minionId) {
        logToConsole(`Removing key for ${minionId}...`);
        try {
            const response = await fetch(`${proxyUrl}/keys/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ minionId })
            });

            if (!response.ok) {
                throw new Error(`Failed to remove key for ${minionId}.`);
            }

            logToConsole(`Successfully removed key for ${minionId}.`, 'success');
            openConnectDeviceModal(); // Refresh the modal
            fetchAvailableDevices(); // Refresh the main device list
        } catch (error) {
            console.error('Error removing key:', error);
            logToConsole(`Error removing key for ${minionId}: ${error.message}`, 'error');
        }
    }

    document.querySelector('.btn-connect').addEventListener('click', openConnectDeviceModal);
    closeButton.addEventListener('click', closeConnectDeviceModal);
    modalContent.addEventListener('click', (event) => {
        if (event.target.classList.contains('btn-accept')) {
            const minionId = event.target.dataset.minionId;
            acceptKey(minionId);
        } else if (event.target.classList.contains('btn-remove')) {
            const minionId = event.target.dataset.minionId;
            removeKey(minionId);
        }
    });

    // --- Initial Load ---
    fetchAvailableDevices();
});