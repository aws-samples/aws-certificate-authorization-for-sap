# aws-sap-cert-auth

This is a sample serverless application (based on AWS Serverless Application Model - AWS SAM) for single signon to SAP applications from AWS Lambda using certificate based user authentication. This application package contains a Lambda layer to generate SAP user certificates based on the user context. Both Cognito and IAM users are supported. Federated Cognito IDs are supported as well. The package also contains a sample Lambda function that connects with a backend SAP application and authenticates using certificates.

## Requirements

* [AWS CLI already configured with Administrator permission](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-welcome.html)
* SAP application (ABAP stack). If required, you can create an SAP ABAP developer edition using cloud formation template [here](https://github.com/aws-samples/aws-cloudformation-sap-abap-dev)
* SAP application should be configured for SSL support. Check [here](https://help.sap.com/viewer/e73bba71770e4c0ca5fb2a3c17e8e229/7.5.8/en-US/4923501ebf5a1902e10000000a42189c.html) for more info. If you are using SAP ABAP Developer edition, this step is not required.

## Setup Process

### Preparation

1. Create parameter store entry for storing server key passphrase. Make sure to change the name and value as required. 
```bash
aws ssm put-parameter \
    --name saponaws-cert-auth-server-passphrase \
    --description "Parameter to store Server Key Pass Phrase for SAP Certs" \
    --value 12345 \
    --type "SecureString" \
    --overwrite \
```

2. Create parameter store entry for storing user key passphrase. Make sure to change the name and value as required. 
```bash
aws ssm put-parameter \
    --name saponaws-cert-auth-user-passphrase \
    --description "Parameter to store User Key Pass Phrase for SAP Certs" \
    --value 12345 \
    --type "SecureString" \
    --overwrite \
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

### Installation

1. Provide the following values for Application Settings

| Variable | Value |
| -------- | ----- |
| Application name | The stack name of this application created via AWS CloudFormation. For e.g. aws-sap-cert-auth |
| Environment | Unique name to add all the resources that are created through this template. For e.g. aws-sap-cert-auth  |
| S3BucketForKeys | Name of the S3 bucket where the certificates and keys will be stored. Provide the S3 bucket name that you created in preparation step 6. For 'sap-cert-based-auth-keys' |
| ServerKeyParameterStore | Name of the parameter store where SAP Server Key is stored. Provide the paramter store parameter that you created in preparation step 1 here |
| UserKeyParameterStore | Name of the parameter store where User Server Key is stored. Provide the paramter store parameter that you created in preparation step 2 here|
| ServerCertFile | Name of the Server Certificate file. Provide the name of the server certificate you created in preparation step 3 here. For e.g. server.crt |
| ServerKeyFile | Name of the Server Key file. Provide the name of the server key you created in preparation step 5 here. For e.g. server.key |

2. Click on 'Deploy' to deploy this application. This should launch a cloud formation stack to created the required resources.

### Testing

1. Go to the Cloudformation stack outputs and get the name of the test Lambda function created. The output displays the ARN of the Lambda funnction created.

2. Go to the Lambda function console and update the following environment variables

| Variable | Value |
| -------- | ----- |
| SAP_HOST_URL | Provide your SAP host url. For e.g. mysaphttpurl.com without https:// |
| SAP_HOST_PORT | Provide the HTTPs port for your SAP application. For e.g. 44300 |
| REJECT_SELF_SIGNED_CERTS | Change it to false if you are using self signed certificates |

3. Create a text event using the sample payload provided below. Below is a sample for Cognito federated identities. 
```javascript
{
    "requestContext" : {
        "authorizer" : {
            "claims" : {
                "identities": {
                    "userId": "DEVELOPER"
                }
            }
        }
    }
}
```

4. Execute the test and validate the results. If all works fine, you should get a response from SAP with the user ID of the logged in user. Try changing the userId value in the test JSON and validate the responses you receive from SAP. You should get a response payload as below. Check the <USERNAME> value and it should be the same as the one you provided in the test input event. 
```javascript
{
  "success": true,
  "body": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><SOAP-ENV:Envelope xmlns:SOAP-ENC=\"http://schemas.xmlsoap.org/soap/encoding/\" xmlns:SOAP-ENV=\"http://schemas.xmlsoap.org/soap/envelope/\"><SOAP-ENV:Body><urn:ME_GET_CURRENT_USER_ID.Response xmlns:urn=\"urn:sap-com:document:sap:rfc:functions\"><USERNAME>DEVELOPER</USERNAME></urn:ME_GET_CURRENT_USER_ID.Response></SOAP-ENV:Body></SOAP-ENV:Envelope>"
}
```

### Error Handling

In case of errors, do the following

1. Change the value of WRITE_CONSOLE_LOG variable to true in the lambda environment variables. This will write more logs in the terminal window

2. Make sure you are able to access your SAP application. In case authentication errors from SAP (for e.g. 401), make sure you have set up STRUST(preparation step 8) and CERTRULE (preparation step 9) correctly. Increase the trace level in SMICM and check for any errors.