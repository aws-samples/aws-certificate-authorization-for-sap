const cdk = require('@aws-cdk/core')
const aws = require("aws-sdk")
const fs = require("fs")
const path = require("path")
const AppConfig = require('./appConfig.json')

aws.config = new aws.Config({
    region: AppConfig.env.region
});

const lambda = new aws.Lambda()

const certFolder = path.join(__dirname, "..", "certificates");
const serverCertFile = path.join(certFolder, "server.crt");
const userCertFile = path.join(certFolder, "sampleUser.crt");

postprocessor();

async function postprocessor() {
    outputs = await describeStacks();
    await invokeLamba()
}

function invokeLamba(){
    return new Promise((resolve,reject)=>{
        try{
            const payload = {
                subject : `/CN=${AppConfig.certificates.serverCertCommonName}/O=${AppConfig.certificates.serverCertOrg}/L=${AppConfig.certificates.serverCertLocation}/C=${AppConfig.certificates.serverCertCountry}`,
                sampleUser : AppConfig.userCertSampleUser
            }
            const params = {
                FunctionName: getOutputValue(AppConfig.cfexports.ServerCertGenLambda),
                Payload: JSON.stringify(payload)
            }
            lambda.invoke(params,(err,data)=>{
                if(err){
                  reject(err)
                }else{
                  var payload = JSON.parse(data.Payload)
                  fs.mkdir(certFolder,{recursive:true},(err)=>{
                    if(err){
                      reject(err)
                    }else{
                      fs.writeFileSync(serverCertFile,Buffer.from(payload.body.serverCert,"utf8"))
                      fs.writeFileSync(userCertFile,Buffer.from(payload.body.userCert,"utf8"))
                    }
                  })
                  
                }
                
            })
        }catch(functionError){
            reject(functionError)
        }
    })
}

function describeStacks() {
    return new Promise((resolve, reject) => {
      try {
        const cf = new aws.CloudFormation();
        cf.describeStacks({ StackName: AppConfig.stackName }, (err, data) => {
          if (err) {
            console.log("Error is describing stack with stack name: ", err);
            reject(err);
          } else {
            if (data.Stacks) {
              const stacks = data.Stacks;
              stacks.sort((x, y) => {
                return y.localeCompare(x);
              });
              resolve(stacks[0].Outputs);
            } else {
              reject("No Stacks");
            }
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function getOutputValue(key) {
    var output = outputs.find((o) => {
      return o.ExportName === key;
    });
    return output.OutputValue;
  }
  