#!/bin/bash

# ======= Change these values [REQUIRED] ======= #
: ${UserKeyPassPhrase:=""}
: ${ServerKeyPassPhrase:=""}
: ${ServerCertFile:=server.crt}
: ${ServerKeyFile:=server.key}

# ======= Change these values [OPTIONAL] ======= #
: ${Environment:=sapcertauth}       # Name will be added to all resources created
: ${Region:=us-east-1}          # Region where resources will be deployed
: ${BucketForKeys:=sap-cert-based-auth-keys}
: ${BucketForSAMApp:=sap-cert-auth-sam-app}
: ${ServerKeyParameterStore:="saponaws-cert-auth-server-passphrase"}
: ${UserKeyParameterStore:="saponaws-cert-auth-user-passphrase"}

# ======= Donot Change anything below this line ======= #
if [ -z "$ServerKeyPassPhrase" ]
then
    echo Provide Server Key PassPhrase
    read -s ServerKeyPassPhrase
fi

if [ -z "$UserKeyPassPhrase" ]
then
    echo Provide User Key PassPhrase
    read -s UserKeyPassPhrase
fi
    
Account=$(aws sts get-caller-identity --output text --query 'Account')

# Create bucket for storing the certs
S3BucketForKeys=$Account-$Region-$Environment-$BucketForKeys 

ServerKeyParameterStore=$Environment-$ServerKeyParameterStore
UserKeyParameterStore=$Environment-$UserKeyParameterStore

aws ssm put-parameter \
    --name $ServerKeyParameterStore \
    --description "Parameter to store Server Key Pass Phrase for SAP Certs" \
    --value $ServerKeyPassPhrase \
    --type "SecureString" \
    --overwrite \

aws ssm put-parameter \
    --name $UserKeyParameterStore \
    --description "Parameter to store User Key Pass Phrase for SAP Certs" \
    --value $UserKeyPassPhrase \
    --type "SecureString" \
    --overwrite \

aws s3 mb s3://$S3BucketForKeys --region $Region
aws s3 cp $ServerCertFile s3://$S3BucketForKeys
aws s3 cp $ServerKeyFile s3://$S3BucketForKeys

# Deploy the app
sam package \
    --output-template-file packaged.yaml \
    --s3-bucket $BucketForSAMApp

aws cloudformation deploy \
    --template-file packaged.yaml \
    --stack-name $Environment \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides \
    Environment=$Environment \
    ServerKeyParameterStore=$ServerKeyParameterStore \
    UserKeyParameterStore=$UserKeyParameterStore  \
    S3BucketForKeys=$S3BucketForKeys  \
    ServerCertFile=$ServerCertFile \
    ServerKeyFile=$ServerKeyFile
    