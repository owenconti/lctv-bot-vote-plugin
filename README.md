# lctv-bot-vote-plugin
Voting system plugin for the LCTV Bot

## Setup
There is no setup or settings required for this plugin. Ensure you enable the plugin in the `setup/custom/settings.json` file.

## Usage
Once the bot is running, there are a couple moderator-only commands available to start a vote session:

* `!vote -s {question}` - Starts a new vote session
* `!vote -c {choice}` - Adds a new choice to the voice session
* `!vote -t {minutes}` - Sets the timeframe for the vote session
* `!vote submit` - Begins voting, and starts the countdown
* `!vote {choiceIndex}` - Allows viewers to submit a vote for a choice index
