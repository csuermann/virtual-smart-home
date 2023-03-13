# Virtual-Smart-Home - Backend

This repository contains the source code of the virtual-smart-home backend.
It is published for users to inspect what happens behind the scenes.

## Setting up your own backend

Follow these steps in order to set up the virtual-smart-home backend in your own AWS account:

1. Download the source code of the vsh backend
    1. `git clone git@github.com:csuermann/virtual-smart-home.git`
    1. Switch to the 'sandbox' branch

       `git checkout --track origin/sandbox`
1. Create a new [AWS Account](https://portal.aws.amazon.com/) (or use your existing one)
    1. Create a user for programatic access as described in the first 1 minute and 13 seconds of [this video](https://www.youtube.com/watch?v=KngM5bfpttA)
    1. export your newly created user credentials and default region as environment variables

       `export AWS_ACCESS_KEY_ID=XXXXXXXXXXXXXXXXXXXX`

       `export AWS_SECRET_ACCESS_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`

       `export AWS_DEFAULT_REGION=eu-west-1`
1. Create an [Amazon Developer Account](https://developer.amazon.com/) (or use your existing one)
1. Create a [new Alexa skill](https://developer.amazon.com/alexa/console/ask/create-new-skill)
    1. Name it 'my private vsh'
    1. Chose an appropriate 'Default Language' for you
    1. Chose the 'Smart Home' model
    1. Click next
    1. Take note of 'Your Skill ID' and export it as an environment variable called 'SKILL_ID'

       `export SKILL_ID=amzn1.ask.skill.xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
    1. Click on 'Account Linking' in the side menu
    1. Fill out the form fields
        - Your Web Authorization URI: <https://www.amazon.com/ap/oa>
        - Access Token URI: <https://api.amazon.com/auth/o2/token>
        - Your Client ID: _put in xxx for now, you'll get the needed info in a later step_
        - Your Secret: _put in xxx for now, you'll get the needed info in a later step_
        - Your Authentication Scheme: HTTP Basic
        - Scope: profile
    1. Note down all 'Alexa Redirect URLs'
    1. Click Save
1. Open a new browser tab / window
1. Create a new [Security Profile](https://developer.amazon.com/loginwithamazon/console/site/lwa/create-security-profile.html)
    1. Security Profile Name: virtual smart home
    1. Security Profile Description: security profile for virtual-smart-home skill
    1. Click Save
    1. Click on the tab 'Web Settings'
    1. Copy 'Client ID' and 'Client Secret' into the respective fields on the Account Linking section (of your other browser tab)
    1. Click Edit
    1. Allowed Origins: leave empty
    1. Allowed Return URLs: paste all 'Alexa Redirect URLs' you noted down earlier
    1. Click Save
    1. Click on the tab 'TV and other Device Settings'
    1. Create a new "Device Client" called "node-red-contrib-virtual-smart-home"
    1. Note down the 'Client Id'. You'll later need that Client Id to customize your installation of Node-RED-contrib-virtual-smart-home
1. In the Alexa Developer Console click on 'Permissions' in the side menu
1. Make sure that the 'Send Alexa Events' switch is toggled on
1. Take note of 'Alexa Client Id' and 'Alexa Client Secret' and export both as an environment variables

   `export ALEXA_CLIENT_ID=amzn1.application-oa2-client.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

   `export ALEXA_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

1. Download and install the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) on your computer
1. Run the following command and note down the 'endpointAddress' for your AWS account

   `aws iot describe-endpoint --endpoint-type iot:Data-ATS`
1. Export the value of 'endpointAddress' as an environment variable called 'IOT_ENDPOINT'

   `export IOT_ENDPOINT=xxxxxxxxxxxxxx-ats.iot.eu-west-1.amazonaws.com`
1. Create an IoT Thing Type called 'virtual-smart-home-type'

   `aws iot create-thing-type --thing-type-name "virtual-smart-home-type"`
1. Create an IoT Thing Group called 'virtual-smart-home-things'

   `aws iot create-thing-group --thing-group-name "virtual-smart-home-things"`
1. Create an IoT Billing Group called 'virtual-smart-home-billing-group'

   `aws iot create-billing-group --billing-group-name virtual-smart-home-billing-group`
1. Update the IoT index configuration

   `aws iot update-indexing-configuration --thing-indexing-configuration "thingIndexingMode=REGISTRY_AND_SHADOW, thingConnectivityIndexingMode=STATUS"`

   > NOTE: See [AWS pricing for IoT Device Management](https://aws.amazon.com/iot-device-management/pricing/). Performing this step is not strictly needed to get VSH up and running. If you do not want to enable thing indexing, consider commenting out the `metrics` endpoint in serverless.yml to prevent your CloudWatch logs from being flooded with error messages.

1. Setup [Momento](https://www.gomomento.com/) account and export the generated token as an environment variable called 'MOMENTO_TOKEN'

   `export MOMENTO_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

1. Create 2 environment variable called 'HASH_SECRET' and 'VSH_ADMIN_API_KEY' containing random strings

   `export HASH_SECRET=foobar28429789`

   `export VSH_ADMIN_API_KEY=unguessable8823472893472`

1. Create environment variables user by the serverless deploy process

   `export IS_PROD=false`

   `export LOG_LEVEL=debug`

   `export STRIPE_API_KEY=abc`

   `export STRIPE_WEBHOOK_SECRET=xyz`
1. run `npm install`
1. install the serverless framework by running `npm install -g serverless`
1. run `serverless deploy`
1. Note down the POST endpoint printed as part of the `serverless deploy` output
    - e.g. <https://xxxxxxxxxx.execute-api.eu-west-1.amazonaws.com/dev/provision>
1. Run the following command and note down the 'FunctionArn'

   `aws lambda get-function --function-name virtual-smart-home-dev-skill`
1. In the Alexa Developer Console click on 'Smart Home' in the side menu
1. Paste the value of the FunctionArn (from step 22) as 'Default Endpoint' as well as for 'Europe / India'
1. Click Save
1. To run your backend without limitations, navigate to your DynamoDB https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#item-explorer?table=VSH&maximize=true
   1. Open and edit the Item with SK 'TOKEN'
   1. Add a new attribute 'plan' from type 'string' with the value 'pro'
   1. Save changes
1. Your own backend should now be set up! Congratulations!

## Configuring Node-RED

Now you need to configure your Node-RED vsh-connection node to use _your_ backend instead of the official one.

1. Open the `settings.js` file of your Node-RED installation and add the following just before the closeing "}"

    ```javascript
    vshConnectionShowSettings: true,
    ```

1. Restart Node-RED
1. Create a new vsh node and chose 'add new vsh-connection' from the connection dropdown
1. Replace the 'Backend URL' with the value you noted down in step 21, BUT WITHOUT THE trailing '/provision' !!!
1. Replace 'LWA Client ID' with the value you noted down as 'Client Id' in step 6.12
1. Click 'Add'
1. Come back to the previous page by clicking the pen-icon
1. Follow the account linking instructions, which should now go against your own backend

## Testing that everything works

1. Activate your skill in the Alexa app and complete the Account Linking process (your skill should show up under 'Your skills > Developer')
1. In your AWS account, check the CloudWatch log group '/aws/lambda/virtual-smart-home-dev-skill'. It should contain an "AcceptGrant" request from Alexa and a corresponding response.
1. Open your Node-RED frontend
1. Add a new 'virtual device' to your flow and name it 'foo bar'
1. Open the Developer Tools' network tab
1. Double click on your virtual 'foo bar' device to open the editor
1. Follow the instructions above to configure the vsh-connection to interact with your own backend
1. Observe the activity on the DevTools network tab
   - the call to 'check_version' should go out to your own backend URL
   - the request payload to 'https://api.amazon.com/auth/o2/create/codepair' should include the 'client_id' of the security profile you configured earlier
1. Complete the code pairing process
1. Activate the 'Debug' option of the vsh-connection node
1. Deploy your Node-RED flow
1. Your virtual 'foo bar' device should now get discovered by Alexa.
1. Check the MQTT traffic being logged to stdout of Node-RED
1. Go to the [IoT section](https://eu-west-1.console.aws.amazon.com/iot/home?region=eu-west-1#/thinghub) in your AWS account and click on 'Manage > Things' in the side menu
   - The list should contain one 'Thing' representing your configured vsh-connection
1. Click on the thing and inspect its shadow document that hold the configurations of your devices
1. Click on the 'Activity' menu item and observe shadow changes when you connect / disconnect your connection (e.g. by restarting Node-RED)
