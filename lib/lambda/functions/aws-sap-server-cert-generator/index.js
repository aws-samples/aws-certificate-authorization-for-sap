const userCertGenerator = require('aws-sap-user-cert-generator')

exports.handler = async (event, context) => {
    var config = {}
    config.DDBForCerts = process.env.DDB_FOR_CERTS
    config.certPassSecret = process.env.CERT_PASS_SECRET
    if (event.forceCreate) {
        config.forceCreate = true
    }else{
        config.forceCreate = false
    }
    config.forceCreate = event.forceCreate
    config.subject = event.subject
    config.userId = event.sampleUser
    config.writeConsoleLog = true
    config.requestId =  context.awsRequestId
    return userCertGenerator.generateServerCert(config)
}