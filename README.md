## aws-certificate-authorization-for-sap

This is a sample serverless application (based on AWS Serverless Application Model - AWS SAM) for single signon to SAP applications from AWS Lambda using certificate based user authentication. This application package contains a Lambda layer to generate SAP user certificates based on the user context. Both Cognito and IAM users are supported. Federated Cognito IDs are supported as well. The package also contains a sample Lambda function that connects with a backend SAP application and authenticates using certificates.

## Requirements

* [AWS CLI already configured with Administrator permission](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-welcome.html)
* [NodeJS 8.10+ installed](https://nodejs.org/en/download/)
* [Docker installed](https://www.docker.com/community-edition)
* [AWS SAM CLI installed](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
* SAP application (ABAP stack). If required, you can create an SAP ABAP developer edition using cloud formation template [here](https://github.com/aws-samples/aws-cloudformation-sap-abap-dev)
* SAP application should be configured for SSL support. Check [here](https://help.sap.com/viewer/e73bba71770e4c0ca5fb2a3c17e8e229/7.5.8/en-US/4923501ebf5a1902e10000000a42189c.html) for more info. If you are using SAP ABAP Developer edition, this step is not required.

## Setup Process

### Installation

1. Clone this repo to a folder of your choice

2. Navigate to the root folder of the cloned repo and then perform the preparation steps.
```bash
cd aws-sap-cert-auth
```

### Preparation

1. Create parameter store entry for storing server key passphrase. Make sure to change the name and value as required. 
```bash
aws ssm put-parameter \
    --name saponaws-cert-auth-server-passphrase \
    --description "Parameter to store Server Key Pass Phrase for SAP Certs" \
    --value 12345 \
    --type "SecureString" \
    --overwrite 
```

2. Create parameter store entry for storing user key passphrase. Make sure to change the name and value as required. 
```bash
aws ssm put-parameter \
    --name saponaws-cert-auth-user-passphrase \
    --description "Parameter to store User Key Pass Phrase for SAP Certs" \
    --value 12345 \
    --type "SecureString" \
    --overwrite 
```

3. Create Server Cert and keys. In production you will use a CA signed cert. For development purposes, you can create a self signed certificate. Make sure to change the subject parameter as required. 
```bash
openssl req -x509 -newkey rsa:2048 -keyout servertmp.key -out server.crt -nodes -days 365 -subj "/CN=SAPonAWS/O=AWS/L=Seattle/C=US"
```

4. Create Test User certificate. You create this only for configuring rule based user mapping in SAP later. You don't have to change the subject parameter.
```bash
openssl req -newkey rsa:2048 -keyout usertmp.key -out user.csr -nodes -days 365 -subj "/CN=UNKNOWN"
openssl x509 -req -in user.csr -CA server.crt -CAkey servertmp.key -out user.crt -set_serial 01 -days 365
```

5. Protect the Server Key with password you used in step 1 (value provided for the SSM parameter saponaws-cert-auth-server-passphrase). Make sure to change pass value in the command below
```bash
openssl rsa -aes256 -in servertmp.key -out server.key -passout pass:12345
rm servertmp.key
```

6. Create an S3 bucket to store server and user certificates. Only approved Lambda functions should have read access to this bucket. Make sure to change the bucket name as required
```bash
aws s3 mb s3://<your account id>-sap-cert-based-auth-keys>
```

7. Upload the server key and certficate to the S3 bucket created above
```bash
aws s3 cp server.crt s3://<your account id>-sap-cert-based-auth-keys>
aws s3 cp server.key s3://<your account id>-sap-cert-based-auth-keys>
```

8. Logon to SAP Application and upload the Server Certificate (server.crt) to transaction code STRUST. Make sure to load it under SSL Server Standard (see image below)
![SAP STRUST](/images/sap_strust.png?raw=true)

9. Maintain a generic rule for certificate mapping using transaction code CERTRULE. For creating the rule based on a certificate, use the user certificate you created in step 4 above. Check [here](https://help.sap.com/viewer/d528eef3dca14679bcb47b069aa17a9d/1709%20001/en-US/7c6d4b04370e40319ad790b554aa9a0b.html) for more information

### Local Testing

**Invoking function locally using a local sample payload**

1. Create a file with name environment.json. Use the following format
```javascript
{
    "SAPUserCertAuthTestFunction": {
        "S3_BUCKET_FOR_CERTS" :  "<<Your bucket name from preparation step 6>>",
        "CERT_EXPIRY_IN_DAYS" :  30,
        "SERVER_CERT_FILE_NAME" : "server.crt",
        "SERVER_KEY_FILE_NAME" : "server.key",
        "SERVER_KEY_PASS_PARAM" : "<<Parameter name from perparation step 1>>",
        "USER_KEY_PASS_PARAM" : "<<Parameter name from perparation step 2>>",
        "FORCE_CREATE_NEW_USER_CERT" : "false",
        "WRITE_CONSOLE_LOG" : "false",
        "REJECT_SELF_SIGNED_CERTS": "true", // Change it to false for production
        "SAP_HOST_URL": "mysapapplication.com", // Hostname or IP of your SAP application. Protocol (HTTPs) not required
        "SAP_HOST_PORT": "443" 
     }
}
```

2. Start the Lambda function locally. Note down the end point url where Lambda is running. Usually http://127.0.0.1:3001
```bash

sam local start-lambda \
    --env-vars environment.json \
    --template ../template.yaml \
    --parameter-overrides \
        'ParameterKey=ServerKeyParameterStore,ParameterValue=<<Parameter name from perparation step 1>> ParameterKey=UserKeyParameterStore,ParameterValue=<<Parameter name from perparation step 1>> ParameterKey=S3BucketForKeys,ParameterValue=<<Your bucket name from preparation step 6>>'

```

3. Open another terminal window and run the following command to invoke the lambda function. Validate the local endpoint url for Lambda
```bash

aws lambda invoke \
    --function-name "SAPUserCertAuthTestFunction" \
    --endpoint-url "http://127.0.0.1:3001" \
    --no-verify-ssl \
    out.txt

```
4. Once run, check out.txt which should have the output of the lambda function

### Error Handling

In case of errors, do the following

1. Change the value of WRITE_CONSOLE_LOG variable to true in the environment.json file. This will write more logs in the terminal window

2. Make sure you are able to access your SAP application. In case authentication errors from SAP (for e.g. 401), make sure you have set up STRUST(preparation step 8) and CERTRULE (preparation step 9) correctly. Increase the trace level in SMICM and check for any errors.

## Deployment

1. Create a S3 bucket for storing latest version of your SAM app. If you are using an existing bucket, proceeed to step 2
```bash

aws s3 mb s3://<your account id>-sap-cert-based-auth-sam-app>

```

2. Package the SAM app
```bash

sam package \
    --output-template-file packaged.yaml \
    --s3-bucket <<Your S3 bucket for SAM apps created above>>

```

3. Deploy the SAM app
```bash
aws cloudformation deploy \
    --template-file packaged.yaml \
    --stack-name sapcertauth \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides \
    Environment=sapcertauth \
    ServerKeyParameterStore=<<Parameter name from perparation step 1>> \
    UserKeyParameterStore=<<Parameter name from perparation step 2>>  \
    S3BucketForKeys=<<Your bucket name from preparation step 6>>  \
    ServerCertFile=<<Server certificate file create in preparation step 3. for e.g. server.crt>> \
    ServerKeyFile=<<Server certificate file create in preparation step 5. for e.g. server.key>>
```

## Cleanup

In order to delete our Serverless Application recently deployed you can use the following AWS CLI Command:
```bash
aws cloudformation delete-stack --stack-name sapcertauth
```

## License Summary

This sample code is made available under the MIT-0 license. See the LICENSE file.
