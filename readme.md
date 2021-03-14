# Virtual-Smart-Home - Backend

This repository contains the source code of the virtual-smart-home backend. It is published for users to inspect what happens behind the scenes. Note that the repository is not yet in a shape that allows you to
run your own backend easily.

## Lambda Endpoints

North America: arn:aws:lambda:us-east-1:146271617960:function:virtual-smart-home-dev-skill:LIVE-VSH-SKILL
Europe / India: arn:aws:lambda:eu-west-1:146271617960:function:virtual-smart-home-dev-skill:LIVE-VSH-SKILL
Far East: arn:aws:lambda:us-west-2:146271617960:function:virtual-smart-home-dev-skill:LIVE-VSH-SKILL

## Conventions

- ThingIds: vsht-xxx
- Devices: vshd-xxx

## Kill Switch / Service Operations

VSH things subscribe to special topics for service operations which can be used to force-disconnect misbehaving things.

### v1
topic: vsh/vsht-d1dc6353-8fd8-4d67-8668-d9ef9d6d01b5/kill
topic: vsh/version/1.0.0/kill
message: {"reason":"KILLED"}

### v2
topic: vsh/service
topic: vsh/version/2.0.0/service
topic: vsh/vsht-d1dc6353-8fd8-4d67-8668-d9ef9d6d01b5/service
kill message: {"operation":"kill","reason":"KILLED"}
ping message: {"operation":"ping"}

Subscribe to pong messages sent from devices:
vsh/+/pong


## Versions

https://docs.aws.amazon.com/lambda/latest/dg/configuration-aliases.html

aws lambda update-alias --function-name virtual-smart-home-dev-skill --function-version 24 --name LIVE-VSH-SKILL --region eu-west-1
aws lambda update-alias --function-name virtual-smart-home-dev-skill --function-version \$LATEST --name LIVE-VSH-SKILL --region eu-west-1

## Shadow

{
  "reported": {
    "connected": true,
    "vsh_version": "1.10.0",
    "nr_version": "1.2.2",
    "devices": {
      "vshd-xxx": {
        "template": "COLOR_CHANGING_LIGHT_BULB",
        "friendlyName": "Flur Licht"
      },
      "vshd-yyy": {
        "template": "SWITCH",
        "friendlyName": "Heizung"
      },
    }
  }
}

## Setting up your own backend

1. Create a separate AWS account
1. Download and install the AWS SDK
1. Create a new aws profile in `~/.aws/credentials` called `vsh-sandbox`
1. Execute `export AWS_PROFILE=vsh-sandbox` to instruct the aws cli to use your new profile
1. Note down your AWS Account ID
    - `aws sts get-caller-identity --output text --query 'Account'`
1. Note down the IoT endpoint for your AWS account
    - `aws iot describe-endpoint --endpoint-type iot:Data-ATS`
1. Create a new security profile called "vsh" at https://developer.amazon.com/settings/console/securityprofile/overview.html
    - TODO: check wether the security profile actually gets created automatically at the time of the skill creation!
    - Note down Client ID and Client Secret (tab: Web Settings). You'll need to add these to set up Account Linking in the Alexa Developer Console
    - Create a new "Device Client" called "node-red-contrib-virtual-smart-home" (tab: TV and other Device Settings) and note down the Client Id
      - you'll need that Client Id to customize your installation of Node-RED-contrib-virtual-smart-home
1. Create a new Alexa Skill at https://developer.amazon.com/alexa/console/ask
    1. TODO
    1. Node down your Skill ID, e.g. amzn1.ask.skill.95f35df-231a-47f2-0000-9704683cf936
    1. Configure Account Linking
        - Your Web Authorization URI: https://www.amazon.com/ap/oa
        - Access Token URI: https://api.amazon.com/auth/o2/token
        - Your Client ID: As shown in the Security Profile created above
        - Your Secret: As shown in the Security Profile created above
        - Your Authentication Scheme: HTTP Basic
        - Scope: profile
1. Create a file `./env.json` and populate it with a JSON object containing the respective values
    ```json
      {
        "AWS_ACCOUNT_ID": "XXX",
        "SKILL_ID": "XXX",
        "ALEXA_CLIENT_ID": "XXX", //alexa developer console > permissions > Alexa Skill Messaging > Alexa Client Id
        "ALEXA_CLIENT_SECRET": "XXX", //alexa developer console > permissions > Alexa Skill Messaging > Alexa Client Secret
        "IOT_ENDPOINT": "XXX"
      }
    ```
1. Create a IoT Thing Type called `virtual-smart-home-type`
1. Create a IoT Thing Group called `virtual-smart-home-things`
1. Create a IoT Billing Group called `virtual-smart-home-billing-group`