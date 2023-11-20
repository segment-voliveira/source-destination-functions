// Learn more about source functions API at
// https://segment.com/docs/connections/sources/source-functions

/**
 * Handle incoming HTTP request
 *
 * @param  {FunctionRequest} request
 * @param  {FunctionSettings} settings
 */
async function onRequest(request, settings) {
	const json = request.json();
	// console.log('json', json);
	const data = json.data;
	// console.log('data', data);

	const parsedJSON = JSON.parse(data);
	// console.log('parsedJSON', parsedJSON);
	console.log(
		'parsedJSON.retorno.notasfiscais',
		parsedJSON.retorno.notasfiscais
	);

	console.log('request', request);

	if (Array.isArray(parsedJSON.retorno.notasfiscais)) {
		console.log('is array');
		for (const nfe of parsedJSON.retorno.notasfiscais) {
			if (
				nfe.notafiscal.situacao === 'Emitida DANFE' ||
				nfe.notafiscal.situacao === 'Autorizada'
			) {
				mapAndFireIdentify(nfe.notafiscal);
				mapAndFireTrack(nfe.notafiscal);
			} else {
				throw new Error('Status nao compativel');
			}
		}
	} else {
		console.log('Inner object not an array');
	}

	//throw new Error('request', request);
}

function mapAndFireIdentify(jsonObj) {
	const name = jsonObj.cliente.nome;
	let firstName = '';
	let lastName = '';

	if (
		jsonObj.cliente.nome != null &&
		typeof jsonObj.cliente.nome === 'string'
	) {
		firstName = jsonObj.cliente.nome.split(' ').slice(0, 1).join(' ');
		lastName = jsonObj.cliente.nome.split(' ').slice(1).join(' ');
	} else {
		firstName = '';
		lastName = '';
	}

	const cpf = jsonObj.cliente.cnpj;
	const email = jsonObj.cliente.email;
	const phone = jsonObj.cliente.fone.replace(/[()\-' ]/g, '');
	const address_city = jsonObj.cliente.cidade;
	const address_street = jsonObj.cliente.endereco;
	const address_postalCode = jsonObj.cliente.cep;
	const address_state = jsonObj.cliente.uf;
	const address = {
		city: address_city,
		street: address_street,
		postalCode: address_postalCode,
		state: address_state
	};

	// See https://segment.com/docs/connections/spec/identify/
	Segment.identify({
		userId: jsonObj.cliente.cnpj,
		traits: {
			firstName: firstName,
			lastName: lastName,
			email: email,
			address: address
		}
	});

	console.log('identify');
}

async function mapAndFireTrack(jsonObj) {
	// See https://segment.com/docs/connections/spec/track/

	const cpf = jsonObj.cliente.cnpj;
	const amount = jsonObj.valorNota;
	const txId = jsonObj.numeroPedidoLoja;
	Segment.track({
		event: 'Purchase Completed',
		userId: cpf,
		properties: {
			amount: amount,
			transaction_id: txId
		}
	});
}
