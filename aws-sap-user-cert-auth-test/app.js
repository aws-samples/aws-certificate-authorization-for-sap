const userCertGenerator = require('aws-sap-user-cert-generator')
const AWS = require("aws-sdk")
const https = require("https")

let response;

exports.lambdaHandler = async (event, context) => {
    var response = {
        success: false,
        body: {}
    };
    try{
        var config = {}
        config.S3BucketForCerts = process.env.S3_BUCKET_FOR_CERTS
        config.certExpiryInDays = process.env.CERT_EXPIRY_IN_DAYS
        config.serverCertFileName = process.env.SERVER_CERT_FILE_NAME
        config.serverKeyFileName = process.env.SERVER_KEY_FILE_NAME
        config.serverKeyPassParam = process.env.SERVER_KEY_PASS_PARAM
        config.userKeyPassParam = process.env.USER_KEY_PASS_PARAM
        if(process.env.FORCE_CREATE_NEW_USER_CERT && process.env.FORCE_CREATE_NEW_USER_CERT.toLowerCase()==="true"){
            config.forceCreateNewUserCert = true    
        }
        if(process.env.WRITE_CONSOLE_LOG && process.env.WRITE_CONSOLE_LOG.toLowerCase()==="true"){
            config.writeConsoleLog = true    
        }
        config.userId = getUserId(event)
        userCertGenerator.loadConfig(config)

        var userCertJson = await userCertGenerator.generateCert()
        response.body = await getDataFromSAP(userCertJson.payload)
        response.success = true
    }catch(functionError){
        console.log("function error", functionError)
        response.body = JSON.stringify(functionError)
    }
    return response
    
};

// Get the user ID
function getUserId(event) {
    var userid = ""
    if(userid == null || userid == ""){
        try{ userid = event.requestContext.authorizer.claims.identities.userId }catch(e){}
    }
    if(userid == null || userid == ""){
        try{ userid = event.requestContext.authorizer.claims["cognito:username"] }catch(e){}
    }
    if(userid == null || userid == ""){
        try{ userid = event.requestContext.identity.userArn }catch(e){}
    }
    if(userid == null || userid == ""){
        //userid = "UNKNOWN"
        throw new Error("Unknown User ID")
    }
    return userid
}

function getDataFromSAP(userCertJson){
    return new Promise((resolve,reject)=>{
        try{
            var options = {}
            options.cert = new Buffer(userCertJson.cert,'base64')
            options.key = new Buffer(userCertJson.key,'base64')
            options.passphrase = userCertJson.userKeyPass
            options.ca = new Buffer(userCertJson.serverCert,'base64')
            if(process.env.REJECT_SELF_SIGNED_CERTS && process.env.REJECT_SELF_SIGNED_CERTS.toLowerCase()==="false"){
                options.rejectUnauthorized = false
            }else{
                options.rejectUnauthorized = true
            }
            options.headers = {
                "Content-type": "text/xml",
            }
            options.hostname = process.env.SAP_HOST_URL
            options.port = parseInt(process.env.SAP_HOST_PORT)
            options.path = '/sap/bc/soap/rfc' 
            options.method = 'POST'
            options.agent = false

            var body = ""
            const req = https.request(options,(res)=>{
                res.on('data', (d) => {
                    body = body + d
                });
                res.on('end',()=>{
                    resolve(body)
                })
            })

            req.on('error', (e) => {
                console.error(e);
                reject(e)
            });

            req.write(require('./rfcrequest.js'))
            req.end();


        } catch (functionError) {
            console.log('functionError from SAP error is', functionError)
            reject(functionError)
        }
    })
}

