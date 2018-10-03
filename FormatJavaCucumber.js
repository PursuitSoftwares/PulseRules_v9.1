const { Webhooks } = require('@qasymphony/pulse-sdk');

exports.handler = function ({ event: body, constants, triggers }, context, callback) {
    function emitEvent(name, payload) {
        let t = triggers.find(t => t.name === name);
        return t && new Webhooks().invoke(t, payload);
    }

    // Payload to be passed in: json style cucumber for java test results
    var payload = body;
    var testResults = payload.result;
    var projectId = payload.projectId;
    var cycleId = payload["test-cycle"];

    var testLogs = [];
    testResults.forEach(function (feature) {
        var featureName = feature.name;
        feature.elements.forEach(function (testCase) {

            if (!testCase.name)
                testCase.name = "Unnamed";

            TCStatus = "passed";

            var reportingLog = {
                exe_start_date: new Date(), // TODO These could be passed in
                exe_end_date: new Date(),
                module_names: [
                    'Test Scenarios'
                ],
                name: testCase.name,
                automation_content: feature.uri + "#" + testCase.name
            };

            var testStepLogs = [];
            order = 0;
            stepNames = [];
            attachments = [];

            testCase.steps.forEach(function (step) {
                stepNames.push(step.name);

                var status = step.result.status;
                var actual = step.name;

                if (TCStatus == "passed" && status == "skipped") {
                    TCStatus = "skipped";
                }
                if (status == "failed") {
                    TCStatus = "failed";
                    actual = step.result.error_message;
                }
                if (status == "undefined") {
                    TCStatus = "failed";
                    status = "failed";
                }

                // Are there an attachment for this step?
                if ("embeddings" in step) {
                    console.log("Has attachment");

                    attCount = 0;
                    step.embeddings.forEach(function (att) {
                        attCount++;
                        var attachment = {
                            name: step.name + " Attachment " + attCount,
                            "content_type": att.mime_type,
                            data: att.data
                        };
                        console.log("Attachment: " + attachment.name)

                        attachments.push(attachment);
                    });
                }

                var expected = step.keyword + " " + step.name;

                if ("location" in step.match) {
                    expected = step.match.location;
                }

                var stepLog = {
                    order: order,
                    description: step.name,
                    expected_result: step.keyword,
                    actual_result: actual,
                    status: status
                };

                testStepLogs.push(stepLog);
                order++;
            });

            reportingLog.attachments = attachments;
            reportingLog.description = stepNames.join("<br/>");
            reportingLog.status = TCStatus;
            reportingLog.test_step_logs = testStepLogs;
            reportingLog.featureName = featureName;
            testLogs.push(reportingLog);
        });
    });

    var formattedResults = {
        "projectId": projectId,
        "test-cycle": cycleId,
        "logs": testLogs
    };

    // Pulse Version
    // Emit next fxn to upload results/parse
    emitEvent('UpdateQTestWithFormattedResultsEvent', formattedResults);

}
