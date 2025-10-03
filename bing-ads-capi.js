/**
 * You will be using the Bing Ads REST API to send offline conversions to Bing (docs here https://learn.microsoft.com/en-us/advertising/campaign-management-service/applyofflineconversions?view=bingads-13&tabs=sandbox&pivots=rest-)
 * Combined with the Segment destination functions framework (documents here: https://segment.com/docs/connections/functions/destination-functions/)
 * Here are some notes I captured in the process which might be helpful for you:
 * 
 * I. Getting Started
 * What you need to get started:
 * Microsoft Ads account (sign in here: https://ads.microsoft.com/)
 * Access to the Azure portal
 * A valid Microsoft click id (a unique 32 characters long GUID generated when an ad is clicked)
 * Basic understanding of Postman
 *
 * II. Authenticate and get and access token
 * Every time you send a request to the API, you need to use a short-lived access token.
 * Microsoft recommends using the Microsoft identity platform so I will use this method to authenticate. If you get stuck in one of the below steps, don’t hesitate to check the official documentation here (https://docs.microsoft.com/en-us/advertising/guides/authentication-oauth-identity-platform?view=bingads-13).
 *  
 * Register your application
 * First, register your application in the Azure Portal (https://go.microsoft.com/fwlink/?linkid=2083908) by clicking on New Registration. Once you registered your application, it will generate an application id also called client id (eg: 6731de76–14a6–49ae-97bc-6eba69199999) which you will need for the next step.
 * Select the Add a redirect URI link and make sure to select at least the redirect URI: https://login.microsoftonline.com/common/oauth2/nativeclient.
 * 
 * Request user consent
 * You need to provide consent for your application by generating an authorization code. Copy the below URL and fill in your client id.
 * https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=<SAClientId>&response_type=code&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient&response_mode=query&scope=openid%20offline_access%20https%3A%2F%2Fads.microsoft.com%2Fmsads.manage
 * Paste the URL in your browser (note that this won’t work through Postman). It will prompt you to the Microsoft login portal where you’ll need to authenticate and consent permission for your app to manage your Microsoft accounts (when finished, you will have to do this step so their account can use your app). Once done, you should be redirected to a blank page with an authorization code in the URL:
 * https://login.microsoftonline.com/common/oauth2/nativeclient?code=YOUR_AUTHORIZATION_CODE_HERE
 * Save that authorization code for the next step. Note that it will expire after a few minutes (very very short timeframe).
 * 
 * Get a Refresh Token
 * Create a Postman POST request to  https://login.microsoftonline.com/common/oauth2/v2.0/token/
 * Selected body x-www-form-urlencoded and fill with the following values:
 * client_id: your client id
 * code: the authorization code obtained earlier
 * grant_type: code
 * redirect_uri: https://login.microsoftonline.com/common/oauth2/nativeclient
 * scope: https://ads.microsoft.com/ads.manage offline_access
 * client_secret: your client secret
 * tenant: common
 * 
 * Hit Send. You should get back an access token and a refresh token.
 * 
 * Refresh the access token
 * The access token generated above will only last for 60 minutes.
 * To refresh your access token, create a Postman POST request to https://login.microsoftonline.com/common/oauth2/v2.0/token/
 * Select body x-www-form-urlencoded and fill with the following values:
 * client_id: your client id
 * refresh_token: your refresh token
 * grant_type: refresh_token
 * redirect_uri: https://login.microsoftonline.com/common/oauth2/nativeclient
 * scope: https://ads.microsoft.com/ads.manage  offline_access
 * client_secret: your client secret
 * tenant: common
 * 
 * Hit Send. You should get back a new access token. As the refresh token is long-lived (90 days), you should be able to reuse this request every time you need a new access token. Note the response also returns a new refresh token.
 */

function retrieveConversionNameFromEventName(eventName) {
	let conversionName = '';
	if (eventName === 'Document Downloaded') {
		conversionName = 'Document_Downloaded_Leads';
	} else {
		throw new Error('Conversion name could not be retrieved for event');
	}

	return conversionName;
}

async function retrieveAuthToken(settings) {
	const TTL = 50 * 60 * 1000; // 50 minutes
    //cache the auth token to avoid retrieving it for each event
	const authToken = await cache.load('authtoken', TTL, async () => {
		var bodyDetails = {
			client_id: settings.clientId || '<default client ID>',
			refresh_token:
				settings.refreshToken ||
				'<default refresh token>',
			grant_type: 'refresh_token',
			redirect_uri:
				'https://login.microsoftonline.com/common/oauth2/nativeclient',
			scope: 'https://ads.microsoft.com/msads.manage offline_access',
			tenant: 'common'
		};

		var formBody = [];
		for (var property in bodyDetails) {
			var encodedKey = encodeURIComponent(property);
			var encodedValue = encodeURIComponent(bodyDetails[property]);
			formBody.push(encodedKey + '=' + encodedValue);
		}
		formBody = formBody.join('&');

		try {
			const RESPONSE = await fetch(
				'https://login.microsoftonline.com/common/oauth2/v2.0/token/',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
					},
					body: formBody
				}
			);

			const DATA = await RESPONSE.json();
			const AUTH_TOKEN = DATA.access_token;
			return AUTH_TOKEN;
		} catch (error) {
			// Retry on connection error
			console.log('error retrieving auth token');
			throw new RetryError('Error retrieving auth: ', error.message);
		}
	});
	//console.log('auth: ' + authToken);
	return authToken;
}

/**
 * Handle track event
 * @param  {SegmentTrackEvent} event
 * @param  {FunctionSettings} settings
 */
async function onTrack(event, settings) {
	const HASH = crypto.createHash('sha256');
	const conversionTime = event.properties.properties.CREATED_DATE;
	let conversionName = retrieveConversionNameFromEventName(event.event);

	const BINGADS_ENDPOINT =
		settings.bingAdsEndpoint ||
		'https://campaign.api.sandbox.bingads.microsoft.com/CampaignManagement/v13/OfflineConversions/Apply';

	const AUTH_TOKEN = await retrieveAuthToken(settings);

	const headerDetails = {
		AuthenticationToken: AUTH_TOKEN,
		CustomerAccountId: settings.customerAccountId || '<your customer account ID>',
		CustomerId: settings.customerId || '<your customer ID>',
		DeveloperToken: settings.developerToken || '<your developer token>',
		'Content-Type': 'application/json'
	};

	try {
		//retrieve msclkid from event properties
        const msclkid = event.properties?.MSCLKID;

		if (!msclkid) {
			throw Error(
				'No msclkid associated to the contact. Will not send conversion'
			);
		}

		const RESPONSE = await fetch(BINGADS_ENDPOINT, {
			method: 'POST',
			headers: headerDetails,
			body: JSON.stringify({
				OfflineConversions: [
					{
						ConversionName: conversionName,
						ConversionTime: conversionTime,
						HashedEmailAddress: HASH.update(event.properties?.email).digest('hex'),
						MicrosoftClickId: msclkid
					}
				]
			})
		});

		// Handle retriable HTTP status codes
		if (RESPONSE.status >= 500 || RESPONSE.status === 429) {
			console.error(`Retriable error: HTTP ${RESPONSE.status}`);
			throw new RetryError(`Retriable HTTP error: ${RESPONSE.status}`);
		}

		// Handle non-retriable HTTP errors
		if (!RESPONSE.ok) {
			console.error(`Non-retriable HTTP error: ${RESPONSE.status}`);
			console.log(RESPONSE);
			throw new Error(`Non-retriable HTTP error: ${RESPONSE.status}`);
		}

		const RESPONSE_DATA = await RESPONSE.json();

		// Check for PartialErrors and throw as non-retriable errors
		if (RESPONSE_DATA.PartialErrors && RESPONSE_DATA.PartialErrors.length > 0) {
			RESPONSE_DATA.PartialErrors.forEach(error => {
				console.error(`Bing API Error: ${error.Message}`);
				throw new Error(error.Message);
			});
		}
	} catch (error) {
		// Network or unexpected errors
		console.error('Error sending conversion:', error.message);

		// Retry on known connection-related errors
		if (
			error.name === 'FetchError' ||
			error.code === 'ECONNRESET' ||
			error.code === 'ETIMEDOUT'
		) {
			throw new RetryError(error.message);
		}

		throw error; // Non-retriable
	}
}

async function onBatch(events, settings) {
	// Group events
	const eventsByType = {};
	for (const event of events) {
		if (!(event.type in eventsByType)) eventsByType[event.type] = [];
		eventsByType[event.type].push(event);
	}
    //only process track events
	const trackEvents = eventsByType['track'] || [];

	const AUTH_TOKEN = await retrieveAuthToken(settings);
	const BINGADS_ENDPOINT =
		settings.bingAdsEndpoint ||
		'https://campaign.api.sandbox.bingads.microsoft.com/CampaignManagement/v13/OfflineConversions/Apply';

	const headerDetails = {
		AuthenticationToken: AUTH_TOKEN,
		CustomerAccountId: settings.customerAccountId || '<your customer account ID>',
		CustomerId: settings.customerId || '<your customer ID>',
		DeveloperToken: settings.developerToken || '<your developer token>',
		'Content-Type': 'application/json'
	};

	// One result per *track* event, aligned to trackEvents indices
	const deliveryResults = Array.from({ length: trackEvents.length }, () => ({
		status: 200
	}));

	// Conversions we will actually send + a map back to the original track index
	const offlineConversions = [];
	const indexMap = [];

	// Build conversions with per-item error handling
	await Promise.all(
		trackEvents.map(async (event, i) => {
			try {
				const email = event.context?.traits?.email ?? event.userId;

				const msclkid = event.properties?.MSCLKID;
				if (!msclkid) {
					deliveryResults[i] = {
						status: 400,
						errormessage: `No msclkid detected for email ${email}. Will not try to deliver conversion`
					};
					return; // do not enqueue this event
				}

				const hashedEmail = crypto
					.createHash('sha256')
					.update(email)
					.digest('hex');

				let conversionName = retrieveConversionNameFromEventName(event.event);

				offlineConversions.push({
					ConversionName: conversionName,
					ConversionTime: event.properties?.properties?.CREATED_DATE,
					HashedEmailAddress: hashedEmail,
					MicrosoftClickId: msclkid
				});
				indexMap.push(i); // remember which original event this conversion belongs to
			} catch (err) {
				deliveryResults[i] = {
					status: 500,
					errormessage: err?.message || 'Error processing request'
				};
			}
		})
	);

	// If nothing to send, we're done (all were 400/500 already)
	if (offlineConversions.length === 0) {
		return deliveryResults;
	}

	try {
		const RESPONSE = await fetch(BINGADS_ENDPOINT, {
			method: 'POST',
			headers: headerDetails,
			body: JSON.stringify({ OfflineConversions: offlineConversions })
		});

		// Retriable HTTP errors -> bubble up as RetryError (unchanged behavior)
		if (RESPONSE.status >= 500 || RESPONSE.status === 429) {
			console.error(`Retriable error: HTTP ${RESPONSE.status}`);
			throw new RetryError(`Retriable HTTP error: ${RESPONSE.status}`);
		}

		// Non-retriable HTTP errors -> mark all sent items as 500 (that aren't already set)
		if (!RESPONSE.ok) {
			console.error(`Non-retriable HTTP error: ${RESPONSE.status}`);
			indexMap.forEach(origIdx => {
				// don't overwrite earlier 400/500 from the build phase
				if (deliveryResults[origIdx].status === 200) {
					deliveryResults[origIdx] = {
						status: RESPONSE.status,
						errormessage: 'Non-retriable HTTP error'
					};
				}
			});
			return deliveryResults;
		}

		const RESPONSE_DATA = await RESPONSE.json();

		// Default successful ones to 200; overwrite below if PartialErrors exist
		indexMap.forEach(origIdx => {
			if (deliveryResults[origIdx].status === 200) {
				deliveryResults[origIdx] = { status: 200 };
			}
		});

		// Map PartialErrors[Index] -> original event index via indexMap
		if (
			Array.isArray(RESPONSE_DATA.PartialErrors) &&
			RESPONSE_DATA.PartialErrors.length > 0
		) {
			RESPONSE_DATA.PartialErrors.forEach(errObj => {
				const sentIndex = errObj.Index; // index within offlineConversions
				if (
					typeof sentIndex === 'number' &&
					sentIndex >= 0 &&
					sentIndex < indexMap.length
				) {
					const origIdx = indexMap[sentIndex];
					deliveryResults[origIdx] = {
						status: 500,
						errormessage: errObj.Message || 'Error processing request'
					};
				}
			});
		}

		return deliveryResults;
	} catch (error) {
		// Network / unexpected errors
		console.error('Error sending batch conversions:', error.message);

		if (
			error.name === 'FetchError' ||
			error.code === 'ECONNRESET' ||
			error.code === 'ETIMEDOUT'
		) {
			// Preserve existing behavior: signal retriable failure upward
			throw new RetryError(error.message);
		}

		// Mark all *attempted* sends as 500 if they are still 200
		indexMap.forEach(origIdx => {
			if (deliveryResults[origIdx].status === 200) {
				deliveryResults[origIdx] = {
					status: 500,
					errormessage: error.message || 'Error processing request'
				};
			}
		});

		return deliveryResults; // Non-retriable: return what we have
	}
}
