// Copyright 2015, EMC, Inc.
/* jshint node:true */

'use strict';

var uuid = require('node-uuid');

describe('Install OS Job', function () {
    var InstallOsJob;
    var subscribeRequestProfileStub;
    var subscribeRequestPropertiesStub;
    var subscribeHttpResponseStub;
    var job;
    var waterline;
    var Promise;

    before(function() {
        helper.setupInjector(
            _.flattenDeep([
                helper.require('/lib/jobs/base-job'),
                helper.require('/lib/jobs/install-os'),
                helper.require('/lib/utils/job-utils/catalog-searcher'),
                helper.di.simpleWrapper({ catalogs:  {} }, 'Services.Waterline')
            ])
        );

        InstallOsJob = helper.injector.get('Job.Os.Install');
        waterline = helper.injector.get('Services.Waterline');
        Promise = helper.injector.get('Promise');
        subscribeRequestProfileStub = sinon.stub(
            InstallOsJob.prototype, '_subscribeRequestProfile');
        subscribeRequestPropertiesStub = sinon.stub(
            InstallOsJob.prototype, '_subscribeRequestProperties');
        subscribeHttpResponseStub = sinon.stub(
            InstallOsJob.prototype, '_subscribeHttpResponse');
    });

    beforeEach(function() {
        subscribeRequestProfileStub.reset();
        subscribeRequestPropertiesStub.reset();
        subscribeHttpResponseStub.reset();
        job = new InstallOsJob(
            {
                profile: 'testprofile',
                completionUri: '',
                version: '7.0',
                repo: 'http://127.0.0.1:8080/myrepo/7.0/x86_64',
                rootPassword: 'rackhd',
                rootSshKey: null,
                kvm: null,
                users: [
                    {
                        name: 'test',
                        password: 'testPassword',
                        uid: 600,
                        sshKey: ''
                    }
                ],
                dnsServers: null
            },
            {
                target: 'testid'
            },
            uuid.v4());
    });

    after(function() {
        subscribeRequestProfileStub.restore();
        subscribeRequestPropertiesStub.restore();
        subscribeHttpResponseStub.restore();
    });

    it("should have a nodeId value", function() {
        expect(job.nodeId).to.equal('testid');
    });

    it("should have a profile value", function() {
        expect(job.profile).to.equal('testprofile');
    });

    it("should generate correct password", function() {
        expect(job.options.rootEncryptedPassword).to.match(/^\$6\$*\$*/);
        expect(job.options.users[0].encryptedPassword).to.match(/^\$6\$*\$*/);
    });

    it("should remove empty ssh key", function() {
        expect(job.options).to.not.have.property('rootSshKey');
        expect(job.options.users[0]).to.not.have.property('sshKey');
    });

    it("should remove empty kvm flag", function() {
        expect(job.options).to.not.have.property('kvm');
    });

    it("should preserve an existing/positive kvm flag", function() {
        var jobWithKVM = new InstallOsJob(
            {
                profile: 'testprofile',
                completionUri: '',
                version: '7.0',
                repo: 'http://127.0.0.1:8080/myrepo/7.0/x86_64',
                rootPassword: 'rackhd',
                rootSshKey: null,
                kvm: true,
                users: [
                    {
                        name: 'test',
                        password: 'testPassword',
                        uid: 600,
                        sshKey: ''
                    }
                ],
                dnsServers: null
            },
            {
                target: 'testid'
            },
            uuid.v4());
        expect(jobWithKVM.options).to.have.property('kvm');
        expect(jobWithKVM.options.kvm).to.equal(true);
    });


    it("should convert some option to empty array", function() {
        expect(job.options.dnsServers).to.have.length(0);
    });

    it("should set up message subscribers", function() {
        var cb;
        waterline.catalogs.findMostRecent = sinon.stub().resolves({});
        return job._run().then(function() {
            expect(subscribeRequestProfileStub).to.have.been.called;
            expect(subscribeRequestPropertiesStub).to.have.been.called;
            expect(subscribeHttpResponseStub).to.have.been.called;

            cb = subscribeRequestProfileStub.firstCall.args[0];
            expect(cb).to.be.a.function;
            expect(cb.call(job)).to.equal(job.profile);

            cb = subscribeRequestPropertiesStub.firstCall.args[0];
            expect(cb).to.be.a.function;
            expect(cb.call(job)).to.equal(job.options);

            cb = subscribeHttpResponseStub.firstCall.args[0];
            expect(cb).to.be.a.function;
        });
    });

    it('should provide the given user credentials to the context', function() {
        expect(job.context.users).to.deep.equal(
            job.options.users.concat({name: 'root', password: 'rackhd', privateKey: undefined})
        );
    });

    describe('test _convertInstallDisk', function() {
        var catalog = {
            data: [
                {
                    identifier: 0,
                    linuxWwid: '/dev/test0',
                    esxiWwid: 't10.abcde'
                },
                {
                    identifier: 1,
                    linuxWwid: '/dev/test1',
                    esxiWwid: 'naa.rstuvw'
                },
                {
                    identifier: 2,
                    linuxWwid: '/dev/test2',
                    esxiWwid: 'naa.xyzopq'
                }
            ]
        };

        beforeEach(function() {
            job = new InstallOsJob(
                {
                    profile: 'testprofile',
                    completionUri: '',
                    version: '7.0',
                    repo: 'http://127.0.0.1:8080/myrepo/7.0/x86_64',
                    rootPassword: 'rackhd',
                    rootSshKey: null,
                    users: [
                        {
                            name: 'test',
                            password: 'testPassword',
                            uid: 600,
                            sshKey: ''
                        }
                    ],
                    dnsServers: null,
                    installDisk: 1,
                    osType: 'esx'
                },
                {
                    target: 'testid'
                },
                uuid.v4());
            waterline.catalogs.findMostRecent = sinon.stub().resolves(catalog);
        });

        afterEach(function() {
            waterline.catalogs.findMostRecent.reset();
        });

        it('should set correct installDisk esxi wwid', function() {
            return job._convertInstallDisk().then(function() {
                expect(job.options.installDisk).to.equal('naa.rstuvw');
            });
        });

        it('should set correct installDisk linux wwid', function() {
            job.options.osType = 'linux';
            return job._convertInstallDisk().then(function() {
                expect(job.options.installDisk).to.equal('/dev/test1');
            });
        });

        it('should not convert if installDisk is string', function() {
            job.options.osType = 'linux';
            job.options.installDisk = 'wwidabcd';
            return job._convertInstallDisk().then(function() {
                expect(job.options.installDisk).to.equal('wwidabcd');
            });
        });

        it('should not convert if installDisk is not either string or number', function() {
            job.options.osType = 'linux';
            job.options.installDisk = [1, 2];
            return expect(job._convertInstallDisk()).to.be.rejectedWith(Error);
        });

        it('should set SATADOM wwid as default if installDisk is not specified', function() {
            job.options.installDisk = null;
            return job._convertInstallDisk().then(function() {
                expect(job.options.installDisk).to.equal('t10.abcde');
            });
        });

        it('should do conversion if installDisk is 0 (for ESXi)', function() {
            job.options.osType = 'esx';
            job.options.installDisk = 0;
            return job._convertInstallDisk().then(function() {
                expect(job.options.installDisk).to.equal('t10.abcde');
            });
        });

        it('should do conversion if installDisk is 0 (for Linux)', function() {
            job.options.osType = 'linux';
            job.options.installDisk = 0;
            return job._convertInstallDisk().then(function() {
                expect(job.options.installDisk).to.equal('/dev/test0');
            });
        });

        it('should reject when installDisk is Number but not exist', function() {
            job.options.installDisk = 100;
            return expect(job._convertInstallDisk()).to.be.rejectedWith(Error);
        });

        it('should set sda if installDisk is null and catalog is empty (Linux)', function() {
            job.options.osType = 'linux';
            job.options.installDisk = null;
            waterline.catalogs.findMostRecent = sinon.stub().resolves({});
            return job._convertInstallDisk().then(function() {
                expect(job.options.installDisk).to.equal('sda');
            });
        });

        it('should set firstdisk if installDisk is null and catalog is empty (ESXi)', function() {
            job.options.osType = 'esx';
            job.options.installDisk = null;
            waterline.catalogs.findMostRecent = sinon.stub().resolves({});
            return job._convertInstallDisk().then(function() {
                expect(job.options.installDisk).to.equal('firstdisk');
            });
        });
    });

    describe('test _validateOptions', function() {

        it('should throw error when username is not given ', function() {
            job.options.users = [{password:'12345', uid:600, sshKey:''}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('username is required');
        });

        it('should throw error when username is empty', function() {
            job.options.users = [
                {"name":"WangW25", "uid":1066, "password":"12345", "sshKey":"123456" },
                {"name": "", "uid":1069, "password":"12345", "sshKey":"123456"}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('username is required');
        });

        it('should throw error when username is not a string ', function() {
            job.options.users = [{name:100, password:'12345', uid:600, sshKey:''}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('username must be a string');
        });

        it('should throw error when username is not valid', function() {
            job.options.users = [{"name":" ", "uid":1066, "password":"12345", "sshKey":"123456"}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('username should be valid ');
        });

        it('username should consist of at least a valid character or number', function() {
            job.options.users = [{"name":"123", "uid":1066, "password":"12345", "sshKey":"123456"}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.not.throw(Error);
        });

        it('should throw error when password is not given', function() {
            job.options.users = [{name: "test", uid:600, sshKey:''}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('password is required');
        });
        
        it('should throw error when password is not a string', function() {
            job.options.users = [{name: "test", password:123, uid:600, sshKey:''}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('password must be a string');
        });

        it('should throw error when the length of password is less than 4', function() {
            job.options.users = [{name: "test", password:"123",uid:600, sshKey:''}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('The length of password should larger than 4');
        });

        it('sshKey is optional', function() {
            job.options.users = [{name: "test", password:"12345", uid:600}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.not.throw(Error);
        });

        it('sshKey is allowed to be null', function() {
            job.options.users = [{name: "test", password:"12345", uid:600, sshKey:null}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.not.throw(Error);
        });

        it('should throw error when sshKey is not a string', function() {
            job.options.users = [{name: "test", password:"12345", uid:600, sshKey:1234}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('sshKey must be a string');
        });

        it('uid is optional', function() {
            job.options.users = [{name:"test", password:'12345', sshKey:''}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.not.throw(Error);
        });

        it('should throw error when uid is null', function() {
            job.options.users = [{name:"test", password:'12345', sshKey:'', uid:null}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('uid must be a number');
        });

        it('should throw error when uid is not a number ', function() {
            job.options.users = [{name:"test", password:'12345', uid:"200",sshKey:''}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('uid must be a number');
        });
 
        it('should throw error when uid is less than 500', function() {
            job.options.users = [{name:"test", password:'12345', uid:200,sshKey:''}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('The uid should between 500 and 65535 (>=500, <=65535)');
        });

        it('should throw error when uid is larger than 65535 ', function() {
            job.options.users = [{name:"test", password:'12345', uid:70000,sshKey:''}];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('The uid should between 500 and 65535 (>=500, <=65535)');
        });

        it("should have a vlanIds array with number", function() {
            job.options.networkDevices = [
                {
                    device: "eth0",
                    ipv4:{
                        ipAddr: "192.168.1.29",
                        gateway: "192.168.1.1",
                        netmask: "255.255.255.0",
                        vlanIds: ['104', '105']
                    }
                }
            ];
            job._validateOptions();
            expect(job.options.networkDevices[0].ipv4.vlanIds[0]).to.equals(104);
            expect(job.options.networkDevices[0].ipv4.vlanIds[1]).to.equals(105);
        });

        it("should change vlanId to vlanIds", function() {
            job.options.networkDevices = [
                {
                    device: "eth0",
                    ipv4:{
                        ipAddr: "192.168.1.29",
                        gateway: "192.168.1.1",
                        netmask: "255.255.255.0",
                        vlanId: ['104', '105']
                    },
                    ipv6:{
                        ipAddr: "fec0::6ab4:0:5efe:157.60.14.21",
                        gateway: "fe80::5efe:131.107.25.1",
                        netmask: "ffff.ffff.ffff.ffff.0.0.0.0",
                        vlanId: [104, 105]
                    }
                }
            ];
            job._validateOptions();
            expect(job.options.networkDevices[0].ipv4.vlanIds[0]).to.equals(104);
            expect(job.options.networkDevices[0].ipv4.vlanIds[1]).to.equals(105);
            expect(job.options.networkDevices[0].ipv6.vlanIds[0]).to.equals(104);
            expect(job.options.networkDevices[0].ipv6.vlanIds[1]).to.equals(105);
        });

        it('should throw vlanId RangeError', function () {
            job.options.networkDevices = [
                {
                    device: "eth0",
                    ipv6:{
                        ipAddr: "fec0::6ab4:0:5efe:157.60.14.21",
                        gateway: "fe80::5efe:131.107.25.1",
                        netmask: "ffff.ffff.ffff.ffff.0.0.0.0",
                        vlanIds: [10555, 106]
                    }
                }
            ];
            expect(function() { job._validateOptions(); })
                .to.throw(RangeError, 'VlanId must be between 0 and 4095.');
        });

        it('should be normal without vlanId input', function () {
            job.options.networkDevices = [
                {
                    device: "eth0",
                    ipv4:{
                        ipAddr: "192.168.1.29",
                        gateway: "192.168.1.1",
                        netmask: "255.255.255.0"
                        //vlanIds: ['104', '105']
                    }
                }
            ];
            expect(job._validateOptions()).to.be.undefined;
        });

        it('should throw ipAddr AssertionError', function () {
            job.options.networkDevices = [
                {
                    device: "eth0",
                    ipv4:{
                        ipAddr: '292.168.1.1',
                        gateway: "192.168.1.1",
                        netmask: "255.255.255.0"
                    }
                }
            ];
            expect(function() { job._validateOptions(); })
                .to.throw(Error.AssertionError, 'Violated isIP constraint');
        });

        it('should throw netmask AssertionError', function () {
            job.options.networkDevices = [
                {
                    device: "eth0",
                    ipv4:{
                        ipAddr: '192.168.1.1',
                        gateway: '192.168.1.1',
                        netmask: '255.255.192.1'
                    }
                }
            ];
            expect(function() { job._validateOptions(); })
                .to.throw(Error.AssertionError, 'Invalid ipv4 netmask.');
        });

        it('should throw ipAddress AssertionError', function () {
            job.options.networkDevices = [
                {
                    device: "eth0",
                    ipv6:{
                        ipAddr: "10ec0::6ab4:0:5efe:157.60.14.21",
                        gateway: "fe80::5efe:131.107.25.1",
                        netmask: "ffff.ffff.ffff.ffff.0.0.1.0"
                    }
                }
            ];
            expect(function() { job._validateOptions(); })
                .to.throw(Error.AssertionError, 'Violated isIP constraint');
        });

        it('should throw netmask AssertionError', function () {
            job.options.networkDevices = [
                {
                    device: "eth0",
                    ipv6:{
                        ipAddr: "fec0::6ab4:0:5efe:157.60.14.21",
                        gateway: "fe80::5efe:131.107.25.1",
                        netmask: "ffff.ffff.ffff.ffff.0.0.1.0"
                    }
                }
            ];
            expect(function() { job._validateOptions(); })
                .to.throw(Error, 'Invalid ipv6 netmask.');
        });

        it('should throw error when mountPoint is not specified', function() {
            job.options.installPartitions = [{ size:'500', fsType:'ext3' }];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('mountPoint is required');
        });

        it('should throw error when mountPoint is not a string', function() {
            job.options.installPartitions = [{ mountPoint:{}, size:'500', fsType:'ext3' }];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('mountPoint must be a string');
        });

        it('should throw error when size is not specified', function() {
            job.options.installPartitions = [{ mountPoint:'/boot', fsType:'ext3' }];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('size is required');
        });

        it('should throw error when size is not a string', function() {
            job.options.installPartitions = [{ mountPoint:'/boot', size:{}, fsType:'ext3' }];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('size must be a string');
        });

        it('should throw error when size is not a number string and not "auto"', function() {
            job.options.installPartitions = [{ mountPoint:'/boot', size:"abc", fsType:'ext3' }];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('size must be a number string or "auto"');
        });

        it('should throw error when fsType is not a string', function() {
            job.options.installPartitions = [{ mountPoint:'/boot', size:'500', fsType:{} }];
            return expect(job._validateOptions.bind(job,{}))
                   .to.throw('fsType must be a string');
        });

        it('should correct fsType when mountPoint is swap but fsType is not swap', function() {
            job.options.installPartitions = [{ mountPoint:'swap', size:'500', fsType:'ext3' }];
            job._validateOptions.bind(job,{})();
            expect(job.options.installPartitions[0].fsType).to.equal('swap');
        });

    });
});
