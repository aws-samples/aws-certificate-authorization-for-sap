const cdk = require('@aws-cdk/core')
const iam = require('@aws-cdk/aws-iam')
const sm = require('@aws-cdk/aws-secretsmanager')
const dynamodb = require('@aws-cdk/aws-dynamodb')
const lambda = require('@aws-cdk/aws-lambda')
const apigw = require('@aws-cdk/aws-apigateway')
const AppConfig = require('./appConfig.json')
const path = require('path')

class AwsSapCertAuthStack extends cdk.Stack {
  /**
   *
   * @param {cdk.Construct} scope
   * @param {string} id
   * @param {cdk.StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    //Lambda role
    const lambdaRole = new iam.Role(this, 'SAPLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    })

    //Add basic execution and VPC execution roles
    lambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSLambdaExecute'))

    //Create Secret for storing cert passphrases
    const certSecret = new sm.Secret(this, 'certauthsecret', {
      generateSecretString: {
        includeSpace: false,
        excludePunctuation: true
      }
    })
    certSecret.grantRead(lambdaRole)

    //DynamoDB for storing certs
    const certTable = new dynamodb.Table(this, 'certauthtable', {
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    certTable.grantReadWriteData(lambdaRole)

    //Lambda Layers
    const userCertGeneratorLayer = new lambda.LayerVersion(this, 'UserCertLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/layers/aws-sap-user-cert-generator')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_8_10, lambda.Runtime.NODEJS_10_X],
      license: 'Apache-2.0',
      description: 'Layer to dynamically generator user certificates for SAP user',
    })

    const requestLayer = new lambda.LayerVersion(this, 'RequestLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/layers//request')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_8_10, lambda.Runtime.NODEJS_10_X],
      license: 'Apache-2.0',
      description: 'Layer for simplifying HTTP requests'
    })



    //Lambda functions
    const serverCertGenerator = new lambda.Function(this, 'ServerCertGenerator', {
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/functions/aws-sap-server-cert-generator')),
      runtime: lambda.Runtime.NODEJS_10_X,
      handler: 'index.handler',
      description: 'Sample Lambda function to create server certs',
      layers: [userCertGeneratorLayer],
      role: lambdaRole,
      timeout: cdk.Duration.seconds(29),
      memorySize: 2048,
      environment: {
        DDB_FOR_CERTS: certTable.tableName,
        CERT_PASS_SECRET: certSecret.secretArn
      }
    })

    const sapproxy = new lambda.Function(this, 'SAPProxy', {
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/functions/aws-sap-http-proxy-sample')),
      runtime: lambda.Runtime.NODEJS_10_X,
      handler: 'index.handler',
      description: 'Sample Lambda function to propagate user from Lambda to SAP using X509 certs',
      layers: [userCertGeneratorLayer, requestLayer],
      role: lambdaRole,
      timeout: cdk.Duration.seconds(29),
      memorySize: 2048,
      environment: {
        DDB_FOR_CERTS: certTable.tableName,
        CERT_EXPIRY_IN_DAYS: AppConfig.certificates.certExpiryInDays,
        CERT_PASS_SECRET: certSecret.secretArn,
        FORCE_CREATE_NEW_USER_CERT: "false",
        WRITE_CONSOLE_LOG: "true",
        SAP_HOST: AppConfig.sap.saphostname,
        SAP_PORT: AppConfig.sap.httpsPort.toString()
      }
    })

    // Create API access
    const sapbackend = new apigw.LambdaIntegration(sapproxy)

    const mock = new apigw.MockIntegration({
      integrationResponses: [{
        statusCode: '200',
        responseParameters: {
          'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-CSRF-Token,aws-sap-oauth-token'",
          'method.response.header.Access-Control-Allow-Methods': "'GET,POST,OPTIONS'",
          'method.response.header.Access-Control-Allow-Origin': "'*'"
        },
        responseTemplates: {
          "application/json": ''
        }
      }],
      passthroughBehavior: apigw.PassthroughBehavior.NEVER,
      requestTemplates: {
        "application/json": '{"statusCode": 200}'
      }
    })

    const sapapi = new apigw.RestApi(this, 'sapcertdemo-proxy')
    
    const proxy = new apigw.ProxyResource(this, 'proxy', {
      parent: sapapi.root,
      anyMethod: false
    })

    proxy.addMethod('ANY', sapbackend, {
      authorizationType: apigw.AuthorizationType.IAM
    })

    proxy.addMethod('OPTIONS', mock, {
      authorizationType: apigw.AuthorizationType.NONE,
      methodResponses: [{
        statusCode: '200',
        responseModels: {
          "application/json": apigw.Model.EMPTY_MODEL
        },
        responseParameters: {
          "method.response.header.Access-Control-Allow-Headers": true,
          "method.response.header.Access-Control-Allow-Methods": true,
          "method.response.header.Access-Control-Allow-Origin": true
        }
      }]
    })

   
    //API access role
    const apiAccessRole = new iam.Role(this, 'SAPDemoAPIAccessRole',{
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      inlinePolicies: {
        "APIAccessPolicy" :  new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['execute-api:Invoke'],
              resources: [sapapi.arnForExecuteApi()]
            })
          ]
        })
      }
    })

    

    //Outputs
    new cdk.CfnOutput(this,'SAPDemoProxyUrl',{
      value: sapapi.url,
      description: "SAP Proxy API Url",
      exportName: AppConfig.cfexports.SAPDemoProxyUrl
    })

    new cdk.CfnOutput(this,'DDBForCertAuth',{
      value: certTable.tableName,
      description: "DDB table to store SAP certs",
      exportName: AppConfig.cfexports.DDBForCertAuth
    })

    new cdk.CfnOutput(this,'ServerCertGenLambda',{
      value: serverCertGenerator.functionName,
      description: "Server Cert Generator Function name",
      exportName: AppConfig.cfexports.ServerCertGenLambda
    })

    new cdk.CfnOutput(this,'RoleforExecuteAPI',{
      value: apiAccessRole.roleName,
      description: "Role name for providing execute API access",
      exportName: AppConfig.cfexports.RoleforExecuteAPI
    })
    

  }
}

module.exports = {
  AwsSapCertAuthStack
}