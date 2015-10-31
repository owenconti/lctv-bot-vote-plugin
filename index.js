'use strict';

const runtime = require('../../utils/Runtime');
const Log = require('../../utils/Log');
const moment = require('moment');

const startSessionRegex = /^(!|\/)vote\s(\-s)\s(.+)$/;
const choiceRegex = /^(!|\/)vote\s(\-c)\s(.+)$/;
const timeRegex = /^(!|\/)vote\s(\-t)\s(\d)$/;
const voteRegex = /^(!|\/)vote\s(\d)$/;

let voteTimeout = null;

module.exports = [{
	name: '!vote -s {question}',
	help: 'Start a vote session with the specified question.',
	types: ['message'],
	regex: startSessionRegex,
	action: function( chat, stanza ) {
		if ( stanza.user.isModerator() ) {
			let voteSession = getCurrentVoteSession();

			// Check for existing vote sesion
			if ( voteSession ) {
				chat.replyTo( stanza.user.username, "A vote session is already in progress!" );
				return;
			}

			let match = startSessionRegex.exec( stanza.message );
			let question = match[3];
			voteSession = {
				question: question,
				choices: [null],
				votes: {},
				timeframe: 3,
				submitted: false,
				voters: []
			};
			setCurrentVoteSession( voteSession );

			chat.sendMessage( `Starting new vote session...` );
		}
	}
}, {
	name: '!vote -c {choice}',
	help: 'Adds a choice to the vote session.',
	types: ['message'],
	regex: choiceRegex,
	action: function( chat, stanza ) {
		if ( stanza.user.isModerator() ) {
			let voteSession = getCurrentVoteSession();

			// Validate the vote session
			if ( !validateVoteSession( voteSession, chat, stanza ) ) {
				return;
			}

			let match = choiceRegex.exec( stanza.message );
			let choice = match[3];

			voteSession.choices.push( choice );
			setCurrentVoteSession( voteSession );

			chat.sendMessage( `Choice: ${choice} added to vote session.` );
		}
	}
}, {
	name: '!vote -t {timeframe}',
	help: 'Tells the bot how long we want the vote to last in minutes (default 3 minutes).',
	types: ['message'],
	regex: timeRegex,
	action: function( chat, stanza ) {
		if ( stanza.user.isModerator() ) {
			let voteSession = getCurrentVoteSession();

			// Validate the vote session
			if ( !validateVoteSession( voteSession, chat, stanza ) ) {
				return;
			}

			let match = timeRegex.exec( stanza.message );
			let timeframe = parseInt( match[3], 10 );

			// Check to make sure the timeframe is a number
			if ( isNaN( timeframe ) ) {
				chat.replyTo( stanza.user.username, "Invalid timeframe specified." );
				return;
			}

			voteSession.timeframe = timeframe;
			setCurrentVoteSession( voteSession );

			chat.sendMessage( `${timeframe} minute timeframe set for vote session.` );
		}
	}
}, {
	name: '!vote submit',
	help: 'Tells the bot we are done submitting choices and the vote can begin.',
	types: ['message'],
	regex: /^(!|\/)vote\s(submit)$/,
	action: function( chat, stanza ) {
		if ( stanza.user.isModerator() ) {
			let voteSession = getCurrentVoteSession();

			// Validate the vote session
			if ( !validateVoteSession( voteSession, chat, stanza ) ) {
				return;
			}

			// Add 1 minute to the timeframe to account for a minute
			// loss when counting down
			voteSession.timeframe++;

			let endTime = moment().add( voteSession.timeframe, 'm' );

			// Set the votes on each choice to 0
			voteSession.choices.forEach( (choice, i) => {
				voteSession.votes[ i ] = 0;
			} );
			voteSession.submitted = true;
			voteSession.endTime = endTime.valueOf();
			setCurrentVoteSession( voteSession );

			startVoteSession( voteSession, chat );

			chat.sendMessage( `${timeframe} minute timeframe set for vote session.` );
		}
	}
}, {
	name: '!vote {choice}',
	help: 'Submits a vote into the current vote session.',
	types: ['message'],
	regex: voteRegex,
	action: function( chat, stanza ) {
		let voteSession = getCurrentVoteSession();

		// Validate the vote session
		if ( !voteSession.submitted || voteSession.voters.indexOf( stanza.user.username ) >= 0 ) {
			return;
		}

		let match = voteRegex.exec( stanza.message );
		let vote = parseInt( match[2], 10 );

		// Check to make sure the vote is a number
		if ( isNaN( vote ) ) {
			return;
		}

		// Make sure the vote is a valid choice
		if ( vote > 0 && vote <= voteSession.choices.length - 1 ) {
			voteSession.votes[ vote ]++;
			voteSession.voters.push( stanza.user.username );
			setCurrentVoteSession( voteSession );
		}
	}
}];

/**
 * Gets the current vote session
 * @return {object}
 */
function getCurrentVoteSession() {
	return runtime.brain.get('plugin-vote') || null;
}

/**
 * Saves the vote session to the brain
 * @param {object} voteSession
 */
function setCurrentVoteSession( voteSession ) {
	runtime.brain.set('plugin-vote', voteSession);
}

/**
 * Validates the vote session to make sure it exists,
 * and that it has not been submitted yet
 * @param  {object} voteSession
 * @param  {Client} chat
 * @param  {object} stanza
 * @return {boolean}
 */
function validateVoteSession( voteSession, chat, stanza ) {
	if ( !voteSession ) {
		chat.replyTo( stanza.user.username, "A vote session does not exist!" );
		return false;
	}

	// Check for submitted vote session
	if ( voteSession.submitted ) {
		chat.replyTo( stanza.user.username, "The vote session is already submitted!" );
		return false;
	}

	return true;
}

/**
 * Starts the vote session.
 * Outputs the available choices and how to vote.
 * Starts the vote countdown.
 * @param  {object} voteSession
 * @param  {Client} chat
 * @return {void}
 */
function startVoteSession( voteSession, chat ) {
	Log.log('[vote] Starting vote session');

	// Build the output, with the available choices
	let output = 'Vote session started! Question:\n';
	output += voteSession.question + '\n\n';
	output += 'Choices:\n';
	voteSession.choices.forEach( ( choice, i ) => {
		// Don't show the 'null' choice
		if ( i > 0 ) {
			output += `${ i }: ${ choice }\n`;
		}
	} );
	output += '\nUse `!vote {Number} to vote`';

	chat.sendMessage( output );
	runVoteInterval( chat );
}

/**
 * Runs the countdown interval.
 * If the vote is over, it outputs the winning choice
 * @param  {Client} chat
 * @return {void}
 */
function runVoteInterval( chat ) {
	let voteSession = getCurrentVoteSession();
	clearTimeout( voteTimeout );

	// Make sure the vote session exists
	if ( !voteSession ) {
		return;
	}

	// Display the remaining time for the vote
	let endMoment = moment( voteSession.endTime );
	let timeRemaining = endMoment.diff( moment(), 'm' );

	Log.log('[vote] Running vote interval, time remaining ' + timeRemaining);

	if ( timeRemaining > 0 ) {
		chat.sendMessage( `${timeRemaining} minutes in current vote session.` );
		voteTimeout = setTimeout( () => {
			runVoteInterval( chat );
		}, 60000 );
	} else {
		// Vote is over, tally the votes and announce the winner
		let keys = Object.keys( voteSession.votes );
		let winningChoice = null;
		keys.forEach( ( key ) => {
			let voteCount = voteSession.votes[ key ];
			let keyInt = parseInt( key, 10 );

			if ( voteCount > 0 && ( !winningChoice || voteCount >= winningChoice.voteCount ) ) {
				winningChoice = {
					key: keyInt,
					choice: voteSession.choices[ keyInt ],
					voteCount: voteCount
				};
			}
		} );

		// Save the vote session
		voteSession = null;
		setCurrentVoteSession( voteSession );

		let voteText = winningChoice.voteCount === 1 ? 'vote' : 'votes';
		chat.sendMessage(`Vote is over! '${winningChoice.choice}' wins with ${winningChoice.voteCount} ${voteText}`);
	}
}
