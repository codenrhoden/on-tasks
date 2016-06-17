'use strict';

module.exports = {
    friendlyName: 'Catalog total memory MBs',
    injectableName: 'Task.Catalog.TotalMemoryMb',
    implementsTask: 'Task.Base.Linux.Catalog',
    options: {
        commands: [
            "echo {'\"memoryMb\"': $(free -m | grep Mem | awk '{print $2}')}"
        ]
    },
    properties: {
        catalog: {
            type: 'total-memory-mb'
        }
    }
};
