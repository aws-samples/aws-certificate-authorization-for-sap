## aws-certificate-authorization-for-sap

This is a sample serverless application for single signon to SAP applications from AWS Lambda using certificate based user authentication. This application package contains a Lambda layer to generate SAP user certificates based on the user context. Both Cognito and IAM users are supported. Federated Cognito IDs are supported as well. The package also contains a sample Lambda function that connects with a backend SAP application and authenticates using certificates. Installation is simplified using [AWS Cloud Development Kit (AWS CDK)](https://docs.aws.amazon.com/cdk/latest/guide/home.html)

## Requirements

* [AWS CLI already configured with Administrator permission](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-welcome.html)
* [NodeJS 10.x installed](https://nodejs.org/en/download/)
* [AWS CDK installed](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html)
* SAP application (ABAP stack). If required, you can create an SAP ABAP developer edition using cloud formation template [here](https://github.com/aws-samples/aws-cloudformation-sap-abap-dev)
* SAP application should be configured for SSL support. Check [here](https://help.sap.com/viewer/e73bba71770e4c0ca5fb2a3c17e8e229/7.5.8/en-US/4923501ebf5a1902e10000000a42189c.html) for more info. If you are using SAP ABAP Developer edition, this step is not required.

## Setup Process

### Installation & Deployment
Note: This process creates various resources in your AWS account. Check the resources created section for more information what gets created. You incur charges for resources using the resources created and you are responsible for those charges.

1. Clone this repo to a folder of your choice

2. Navigate to the root folder of the cloned repo and then install the dependencies.
```bash
cd aws-certificate-authorization-for-sap 
npm install
```

3. Navigate to the lib folder
```bash
cd lib
```

4. Update the appConfig.json file in the lib folder to suit your needs. At a minimum, update your account ID, region and SAP host and https port details. If rquired, also update the serverCertOrg, serverCertLocation, serverCertCountry and userCertSampleUser fields. These are used for creating self signed server certificate that you can upload to SAP application later (see instructions)

5. Navigate to project root folder
```bash
cd ..
```

6. Bootstrap your AWS account for CDK. Please check [here](https://docs.aws.amazon.com/cdk/latest/guide/tools.html) for more details on bootstraping for CDK. Bootstraping deploys a CDK toolkit stack to your account and creates a S3 bucket for storing various artifacts. You incur any charges for what the AWS CDK stores in the bucket. Because the AWS CDK does not remove any objects from the bucket, the bucket can accumulate objects as you use the AWS CDK. You can get rid of the bucket by deleting the CDKToolkit stack from your account.
```bash
cdk bootstrap aws://<YOUR ACCOUNT ID>/<YOUR AWS REGION>
```

7. Deploy the stack to your account. Make sure your CLI is setup for account ID and region provided in the appConfig.json file. 
```bash
cdk deploy
```

8. Once the stack is deployed successfully, execute the post processing script. This will download required server public certificate and a sample user certificate that you can use to setup in SAP. These certficates will be downloaded to 'certficates' folder within the project folder
```bash
node ./lib/aws-sap-cert-auth-pp-stack.js
```

9. Logon to SAP Application and upload the Server Certificate (server.crt from certificates folder) to transaction code STRUST. Make sure to load it under SSL Server Standard (see image below)
![SAP STRUST](/images/sap_strust.png?raw=true)

10. Maintain a generic rule for certificate mapping using transaction code CERTRULE. For creating the rule based on a certificate, use the sample user certificate (sampleuser.crt from certificates folder) created in step above. Check [here](https://help.sap.com/viewer/d528eef3dca14679bcb47b069aa17a9d/1709%20001/en-US/7c6d4b04370e40319ad790b554aa9a0b.html) for more information

### Testing

1. Create an user ID in your AWS account. Name the user to match the email ID that your are using for the user in SAP. For e.g. awsonsapapi@example.com. A template role has been created as a part of this stack. Go to CloudFormation and look for "RoleforExecuteAPI". This role should have a sample policy document that you can use as an in-line policy for this user.

2. From the CloudFormation stack get the value for the url for API. The using a tool like [Postman](https://www.getpostman.com/), call an OData API from the SAP backend (do a 'GET' request). For e.g., if your API url is  https://abcd12345.execute-api.us-east-1.amazonaws.com/prod/, for an ABAP develper edition instance, you can use an url like https://abcd12345.execute-api.us-east-1.amazonaws.com/prod/sap/opu/odata/IWBEP/GWSAMPLE_BASIC/BusinessPartnerSet?%24format=json. Under authorization tab, choose 'AWS Signature' and provide your AccessKey and SecretKey for the user your created above. Also fill in the AWS Region.

3. If you want to check if the user is getting propogated correctly, do a 'POST' request using url /sap/bc/soap/rfc. For e.g., if your API url is  https://abcd12345.execute-api.us-east-1.amazonaws.com/prod/ then you the url for this post request is https://abcd12345.execute-api.us-east-1.amazonaws.com/prod/sap/bc/soap/rfc. Under headers tab, choose 'Content-Type' as 'text/xml' and 'Accept' as 'text/xml'. Provide the below XML payload under body (choose raw format)

```bash
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:sap-com:document:sap:rfc:functions">
   <soapenv:Header/>
   <soapenv:Body>
      <urn:ME_GET_CURRENT_USER_ID/>
   </soapenv:Body>
</soapenv:Envelope>
```

Your response should look something like below. "ME_GET_CURRENT_USER_ID" is a standard RFC function module that outputs the current logged on user ID from SY-UNAME in SAP.

```bash
<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENC=\"http://schemas.xmlsoap.org/soap/encoding/\" xmlns:SOAP-ENV=\"http://schemas.xmlsoap.org/soap/envelope/\">
    <SOAP-ENV:Body>
        <urn:ME_GET_CURRENT_USER_ID.Response xmlns:urn=\"urn:sap-com:document:sap:rfc:functions\">
            <USERNAME>AWSSAPAPI</USERNAME>
        </urn:ME_GET_CURRENT_USER_ID.Response>
    </SOAP-ENV:Body>
</SOAP-ENV:Envelope>
```

### Error Handling

1. For API call errors, enable CloudWatch logging from the API stage.

2. For certificate generation issues, check the cloud watch log for the sample lambda function provide

3. If you received logon error message from SAP, most probably something is missing in your SAP setup. Check STRUST if you have the correct server certificate. Also, validate the setup in CertRule. Check SAP documentation for details.

## Created Resources
Following resources are created as a part of this CDK 

* A Lambda Layer for generating user certificates on demand
* A Lambda function for testing the on demand generation of user certificates
* A Lambda function for generating server and sample user certificate that can be uploaded in SAP STRUST and CERTRULE
* An IAM role and relevant policies and permissions for Lambda execution
* A sample IAM role and relevant policies and permissions for API execution access
* A DynamoDB table to store the server certificate, server key and user certificates
* A secret manager secret to store the certificate pass phrase securely
* An API Gateway API that calls the sample lambda function using Lambda proxy integration

## Cleanup

To delete the arifacts created, from the project root directory execute the following command
```bash
cdk destroy
```

## License Summary

This sample code is made available under the MIT-0 license. See the LICENSE file.
