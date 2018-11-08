const request = require('request');
const { Webhooks } = require('@qasymphony/pulse-sdk');
const ScenarioSdk = require('@qasymphony/scenario-sdk');

console.log("Starting Link Requirements Action");
    
exports.handler = function ({ event: body, constants, triggers }, context, callback) {
    
    function emitEvent(name, payload) {
        let t = triggers.find(t => t.name === name);
        return t && new Webhooks().invoke(t, payload);
    }
    // Specific to pulse actions
    var payload = body;

    var testLogs = payload.logs;
    var projectId = payload.projectId;

    var standardHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `bearer ${constants.QTEST_TOKEN}`,
        'x-scenario-project-id': constants.SCENARIO_PROJECT_ID
    }

    const options = {
        url: constants.Scenario_URL + 'features',
        method: 'GET',
        headers: standardHeaders
    };

    var features;
    request.get(options, function (optserr, optsresponse, resbody) {
        if (optserr) {
            console.log("Problem Getting Feature List: " + optserr);
        }
        else {
            console.log("Got Features List: " + resbody);
            features = JSON.parse(resbody);
            LinkRequirements();
        }
    });
    
    // This makes a best effort to link if test cases exist. Not if you just uploaded via the auto-test-logs endpoint, the job is batched and may not be completed yet
    function LinkRequirements() {
        testLogs.forEach(function (testcase) {
        
        var matchingFeature = features.find(x => x.name === testcase.featureName);

        if(!matchingFeature)
            return;
            
        var reqopts = getReqBody(matchingFeature.issueKey);
        request.post(reqopts, function (err, response, featureResBody) {

            if (err) {
                emitEvent('SlackEvent', { Error: "Problem getting requirement: " + err });
            }
            else {
                if (featureResBody.items.length === 0) // No corresponding feature exists in scenario
                    return;

                var reqid = featureResBody.items[0].id;
                var tcopts = getTCBody(testcase.name);

                request.post(tcopts, function (tcerr, tcresponse, testCaseResBody) {

                    if (tcerr) {
                        emitEvent('SlackEvent', { Error: "Problem getting test case: " + err });
                    }
                    else {
                        if(testCaseResBody.items.length === 0) // Test Case Doesn't yet exist - we'll try this another time
                            return;

                        var tcid = testCaseResBody.items[0].id;
                        var linkopts = getLinkBody(reqid, tcid);

                        request.post(linkopts, function (optserr, optsresponse, resbody) {
                            if (optserr) {
                                emitEvent('SlackEvent', { Error: "Problem creating test link to requirement: " + err });
                            }
                            else {
                                // Success, we added a link!
                                emitEvent('SlackEvent', { Linking: "link added for TC: " + testcase.name + " to requirement " + matchingFeature.issueKey });
                            }
                        });
                    }
                });
            }
        });
    });

    }

    function getTCBody(TCName) {
        return {
            url: "https://" + constants.ManagerURL + "/api/v3/projects/" + projectId + "/search",
            json: true,
            headers: standardHeaders,
            body: {
                "object_type": "test-cases",
                "fields": [
                    "*"
                ],
                "query": "Name = '" + TCName + "'"
            }
        };
    }

    function getReqBody(key) {
        return {
            url: "https://" + constants.ManagerURL + "/api/v3/projects/" + projectId + "/search",
            json: true,
            headers: standardHeaders,
            body: {
                "object_type": "requirements",
                "fields": [
                    "*"
                ],
                "query": "Name ~ '" + key + "'"
            }
        };
    }

    function getLinkBody(reqid, tcid) {
        return {
            url: "https://" + constants.ManagerURL + "/api/v3/projects/" + projectId + "/requirements/" + reqid + "/link?type=test-cases",
            json: true,
            headers: standardHeaders,
            body: [
                tcid
            ]
        };
    }
}
