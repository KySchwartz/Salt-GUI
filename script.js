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
            
            const scriptType = document.querySelector('input[name="script-type"]:checked').value;
            if (scriptType === 'salt') {
                displayScriptArguments(item.textContent);
            } else {
                // For custom scripts, clear the arguments section
                scriptArgsContainer.innerHTML = '';
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
                    fun: 'test.ping'
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API request failed: ${errorData.message || response.statusText}`);
            }

            const data = await response.json();
            const minions = (data.return && typeof data.return[0] === 'object' && data.return[0] !== null) ? data.return[0] : {};
            const activeMinions = Object.keys(minions).filter(minion => minions[minion]);
            const minionCounter = document.querySelector('.minion-counter');
            minionCounter.textContent = `Devices Connected: ${activeMinions.length}`;

            logToConsole(`Found ${activeMinions.length} active minions.`, 'info');
            updateDeviceList(activeMinions);
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
        const minionId = firstDevice.textContent;

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
        const selectedDevices = [...deviceList.querySelectorAll('.selected')].map(item => item.textContent);
        const selectedScriptItem = scriptList.querySelector('.selected');

        if (selectedDevices.length === 0) {
            logToConsole('Please select at least one device.', 'warn');
            return;
        }

        if (!selectedScriptItem) {
            logToConsole('Please select a script to deploy.', 'warn');
            return;
        }

        const scriptName = selectedScriptItem.textContent;
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

    function updateDeviceList(devices) {
        deviceList.innerHTML = '';
        selectDevice.innerHTML = '<option>Select a device</option>';

        if (devices.length === 0) {
            logToConsole('No active devices found.', 'warn');
            const li = document.createElement('li');
            li.textContent = 'No active devices found';
            li.classList.add('disabled');
            deviceList.appendChild(li);
            return;
        }

        devices.forEach(deviceName => {
            const li = document.createElement('li');
            li.textContent = deviceName;
            deviceList.appendChild(li);
            const option = document.createElement('option');
            option.text = deviceName;
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
                fetchAvailableScripts(firstDevice.textContent);
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

    // --- Initial Load ---
    fetchAvailableDevices();
});
