// Learn more about source functions API at
// https://segment.com/docs/connections/sources/source-functions

/**
 * Handle incoming HTTP request
 *
 * @param  {FunctionRequest} request
 * @param  {FunctionSettings} settings
 */
async function onRequest(request, settings) {
	const body = request.json();

	console.log(typeof body.user.name);

	if (
		body.type === 'cliente-conectou-primeira-vez' ||
		body.type === 'cliente-avaliou-positivamente' ||
		body.type === 'cliente-avaliou-negativamente' ||
		body.type === 'cliente-aniversariante-conectou' ||
		body.type === 'cliente-conectou' ||
		body.type === 'cliente-chegou'
	) {
		segmentPayload = new Object();

		if (body.user.name != null && typeof body.user.name === 'string') {
			firstName = body.user.name.split(' ').slice(0, 1).join(' ');
			lastName = body.user.name.split(' ').slice(1).join(' ');
		} else {
			firstName = '';
			lastName = '';
		}

		if (body.user.phone != null && typeof body.user.phone === 'string') {
			phone = body.user.phone.replace(/\s/g, '');
		} else {
			phone = '';
		}

		segmentPayload = {
			anonymousId: body.user.id,
			traits: {
				email: body.user.email == null ? '' : body.user.email,
				phone: phone,
				firstName: firstName ? firstName : '',
				lastName: lastName ? lastName : '',
				birthday: body.birthday
			}
		};

		Segment.identify(segmentPayload);

		Segment.track({
			event: 'User Interacted with Wifi',
			anonymousId: body.user.id,
			properties: {
				interaction_type: body.type,
				message: body.activity.message,
				location: body.establishment.name
			}
		});
	} else {
		return;
	}
}
