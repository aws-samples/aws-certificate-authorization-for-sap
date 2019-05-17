const userCertGenerator = require('aws-sap-user-cert-generator')
const AWS = require("aws-sdk")
const request = require("request")

let response;

const ssm = new AWS.SSM();

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
        //config.userId = getUserId(event)
        config.userId = 'awsuser1'
        userCertGenerator.loadConfig(config)

        var passPhrases= await getSecretsFromParameterStore(config.userKeyPassParam)
        var userCertJson = await userCertGenerator.generateCert()
        response.body = await getDataFromSAP(userCertJson.payload,passPhrases.userKeyPass)
        response.success = true
    }catch(functionError){
        console.log("fiunction error", functionError)
        response.body = JSON.stringify(functionError)
    }
    return response
    
};

// Get secrets from Parameter store
function getSecretsFromParameterStore(userKeyPassParam){
    var response = {}
    response.userKeyPass = ""
    
    return new Promise((resolve,reject) => {
        try{
            var params = {
                Names: [userKeyPassParam],
                WithDecryption: true 
            }
            ssm.getParameters(params,(paramsGetError,data)=>{
                if(paramsGetError){
                    reject(paramsGetError)
                }
                if(data.Parameters && Array.isArray(data.Parameters)){
                    var parameters = data.Parameters
                    if(parameters.length == 1){
                        parameters.forEach((parameter,index)=>{
                            if(parameter.Name == userKeyPassParam){
                                response.userKeyPass = parameter.Value
                            }
                        })
                        resolve(response)
                    }else{
                        reject('Not enough parameters retrieved.')
                    }
                }else{
                    reject('No parameters retrieved')
                }
                
            })
        }catch(functionError){
            reject(functionError)
        }
        
    })
}

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
        userid = "DEVELOPER"
    }
    return userid
}

function getDataFromSAP(userCertJson,userKeyPass){
    return new Promise((resolve, reject) => {
        try {
            var options = {}
            var agentOptions = {}
            agentOptions.cert = new Buffer(userCertJson.cert,'base64')
            agentOptions.key = new Buffer(userCertJson.key,'base64')
            agentOptions.passphrase = userKeyPass
            agentOptions.ca = new Buffer(userCertJson.serverCert,'base64')
            options.agentOptions = agentOptions

            if(process.env.REJECT_SELF_SIGNED_CERTS && process.env.REJECT_SELF_SIGNED_CERTS.toLowerCase()==="false"){
                options.rejectUnauthorized = false
            }
            
            options.url = process.env.SAP_ENDPOINT_URL
            options.method = 'GET'
            options.json = true 
            request(options, (requestError, response, body) => {
                if (requestError) {
                    console.log('Response from SAP error is', requestError.message)
                    reject(requestError)
                }
                resolve(body)
            })
        } catch (functionError) {
            console.log('functionError from SAP error is', functionError)
            reject(functionError)
        }
    })  
}
