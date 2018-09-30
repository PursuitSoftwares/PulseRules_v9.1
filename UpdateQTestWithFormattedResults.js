const request = require('request');
const { Webhooks } = require('@qasymphony/pulse-sdk');
const ScenarioSdk = require('@qasymphony/scenario-sdk');

const Features = {
    getIssueLinkByFeatureName(qtestToken, scenarioProjectId, name) {
        return new ScenarioSdk.Features({ qtestToken, scenarioProjectId }).getFeatures(`"${name}"`);
    }
};

exports.handler = function ({ event: body, constants, triggers }, context, callback) {
    function emitEvent(name, payload) {
        let t = triggers.find(t => t.name === name);
        return t && new Webhooks().invoke(t, payload);
    }

    // Specific to pulse actions
    var payload = body;

    var testLogs = payload.logs;
    var cycleId = payload["test-cycle"];
    var projectId = payload.projectId;

    var scenarioCount = 0;
    var scenarioList = "";

    var standardHearders = {
        'Content-Type': 'application/json',
        'Authorization': `bearer ${constants.QTEST_TOKEN}`
    }

    var createLogsAndTCs = function () {
        var opts = {
            url: "http://" + constants.ManagerURL + "/api/v3/projects/" + projectId + "/auto-test-logs?type=automation",
            json: true,
            headers: standardHearders,
            body: {
                test_cycle: cycleId,
                test_logs: testLogs
            }
        };

        return request.post(opts, function (err, response, resbody) {

            if (err) {
                Promise.reject(err);
            }
            else {
                emitEvent('SlackEvent', { AutomationLogUploaded: resbody });

                if (response.body.type == "AUTOMATION_TEST_LOG") {
                    Promise.resolve("Uploaded results successfully");
                }
                else {
                    emitEvent('SlackEvent', { Error: "Wrong type" });
                    Promise.reject("Unable to upload test results");
                }
            }
        });
    };

    createLogsAndTCs()
        .on('response', function () {
            console.log("About to call Link Requirements Rule")
            emitEvent('LinkScenarioRequirements', payload);
            //linkReq();
        })
        .on('error', function (err) {
            emitEvent('SlackEvent', { CaughtError: err });
        })
}
