/**
 * Created by deniskashuba on 12.11.15.
 */
'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var request = require('request');
var async = require('async');
var cache = require('./cache');
var http = require('http');

var BitcoreNode = require('../../bitcore-node/lib/node');

var BaseService = require('./service');
var inherits = require('util').inherits;

var nodeG = {};
var AddressesController = {};
var bus = {};
var CacheObj = {};

//
// time out to check not sended addresses
//
var timeOutToCheckAddresses = 60000;

//
// confirmations count
//
var achivedConfirmations = [0,1,5];

//
// array of code statuses
//
var arrOfStatusCodes = [200];

//
// prefix for logs of module
//
var prefixForLogs = '[DK changes for insight-API]';

//
// redis HM keys
//
var callbackCacheKey = 'callbackHash';
var callbackControlCacheKey = 'callbackControlHash';
var confirmationsKey = 'confirmationsKey';

//
// controller
//
var CallbackController = function (node, addresses) {

	nodeG = node;
	AddressesController = addresses;
	bus = node.openBus();
	CacheObj = new cache();

	CacheObj.keys(callbackCacheKey, function(data) {

		//
		// init all subscriptions
		//
		proceedSubscribe(data);

		printLogs('Callbacks initiated');
		printLogs(data);

	});

}

//
// inject dependency
//
CallbackController.dependencies = ['db'];
inherits(CallbackController, BaseService);

//
// subscribe handler
//
CallbackController.prototype.subscribe = function () {

	return function (req, res, next) {

		printLogs(req.body);
		printLogs(req.body.addrs);

		if (req.body && req.body.addrs != undefined && req.body.callback_link != undefined) {

			var addrArr = req.body.addrs.split(',');

			printLogs(addrArr);

			if (addrArr.length) {

				async.waterfall([
						function (waterfall) {

							async.eachSeries(addrArr, function (item, callbackItem) {

									CacheObj.hmSetValue(callbackCacheKey, item, req.body.callback_link, null);

									process.nextTick(function () {

										callbackItem();

									});

								},
								function (err) {
									if (err) {

										res.json({
											error: err
										});

									} else {

										waterfall(null);
									}
								});

						},
						function (waterfall) {

							proceedSubscribe(addrArr);

							res.json({
								status : 'done'
							});

						}
					],
					function () {

					});

			}else {

				res.json({
					status : 'failed'
				});

			}

		} else {

			res.json({
				status : 'failed'
			});

		}

	}

};

//
// unsubscribe handler
//
CallbackController.prototype.unsubscribe = function () {

	return function (req, res, next) {

		printLogs(req.body);
		next();

		if (req.body && req.body.addrs) {

			var addr = req.body.addrs.split(',');

			printLogs(addr);

			bus.unsubscribe('address/transaction', addr);

			res.json({
				status : 'done'
			});

		} else {

			res.json({
				status : 'failed'
			});

		}

	}

};

//
// init subscriptions
//
function proceedSubscribe(addr) {

	bus.unsubscribe('address/transaction', addr);

	bus.subscribe('address/transaction', addr);

	bus.on('address/transaction', function () {

		var results = [];

		for (var i = 0; i < arguments.length; i++) {
			results.push(arguments[i]);
		}

		printLogs('+++ callback fired');
		printLogs(results);

		proceedCallbackUrl(results);

	});

}

//
// handler methods
//
function addhttp(url) {
	if (!/^(f|ht)tps?:\/\//i.test(url)) {
		url = "http://" + url;
	}
	return url;
}

//
// call callback
//
function proceedCallbackUrl(results) {

	async.eachSeries(results, function (item, callbackItem) {

			if (item && item.address != undefined) {

				var addrDrtStr = item.address.toString();

				printLogs('+++ addrDrtStr');
				printLogs(addrDrtStr);

				flowToSendRequest(addrDrtStr, false, callbackItem, false);

			}else {

				printLogs('error with item');
				printLogs(item);

			}

		},
		function () {});

};

//
//
//
function flowToSendRequest(addrDrtStr, dontSetTimeMark, callbackItem, anywayTryToSend) {

	async.waterfall([
		function(waterCallback) {

			//callbackControlCacheKey

			if (dontSetTimeMark === true) {

				waterCallback();

			}else {

				CacheObj.hmSetValue(callbackControlCacheKey, addrDrtStr, new Date().getTime(), function() {

					waterCallback();

				});

			}

		},
		function(waterCallback) {

			nodeG.getUnspentOutputs(addrDrtStr, true, function(err, utxos) {

				if(err && err instanceof self.node.errors.NoOutputs) {
					//return res.jsonp([]);
					printLogs('no outputs while callback');
				} else if(err) {
					//return common.handleErrors(err, res);
					printLogs('error while callback');
					printLogs(err);
				}else {
					printLogs('async.eachSeries started');
					async.eachSeries(utxos, function (itemToSend, callbackItemInner) {	
						printLogs(utxos);
						async.waterfall([
							function(innerWater) {

								if (itemToSend != undefined &&
									itemToSend.txid != undefined) {

									nodeG.getTransaction(itemToSend.txid, true, function(err, transaction) {

										if (err && err instanceof nodeG.errors.Transaction.NotFound) {
											printLogs('nodeG.errors.Transaction.NotFound');
										} else if(err) {
											printLogs('error here - getTransaction');
											printLogs(err);
										}else {

											CacheObj.hmSetValue(confirmationsKey, transaction.toBuffer().toString('hex'), addrDrtStr, function () {

												innerWater();

											});

										}

									});

								}else {

									innerWater();

								}

							},
							function() {

								if (anywayTryToSend == true || (itemToSend != undefined &&
									itemToSend.confirmations != undefined &&
									(achivedConfirmations.indexOf(itemToSend.confirmations) >= 0))) {

									CacheObj.hmGetValue(callbackCacheKey, addrDrtStr, function (callbackUrl) {

										printLogs('+++ callbackUrl');
										printLogs(addhttp(callbackUrl));
										printLogs(itemToSend);

										makeCallbackRequest(callbackUrl, addrDrtStr, [mapToApiObject(itemToSend)]);

										callbackItemInner();

									});

								}else {

									printLogs('we get transaction for addr ' + addrDrtStr + ' but confirmations are ' + itemToSend.confirmations);
									callbackItemInner();

								}

							}
						]);

					}, function done() {

						if (callbackItem != undefined && callbackItem != null) {

							process.nextTick(function () {

								callbackItem();

							});

						}

					});

				}

			});

		}
	], function() {



	});

}

function mapToApiObject(utxo) {

	return {
		address: utxo.address,
		txid: utxo.txid,
		vout: utxo.outputIndex,
		ts: utxo.timestamp ? parseInt(utxo.timestamp) : Date.now(),
		scriptPubKey: utxo.script,
		amount: utxo.satoshis / 1e8,
		confirmations: utxo.confirmations
	};

}

//
// make request for callback
//
function makeCallbackRequest(callbackUrl, address, results) {

	try {

		//console.log('show JSON which we trying to send');
		//console.log(JSON.stringify(results));

		request({
				uri: addhttp(callbackUrl),
				//json: true,
				headers : {
					"Content-Type" : "application/json"
				},
				body: JSON.stringify(results),
				method: 'POST'
			}, function (error, response, body) {

				if (error == null &&
					response.statusCode != undefined) {

					printLogs('response.statusCode ' + response.statusCode);

					if (arrOfStatusCodes.indexOf(response.statusCode) >= 0) {

						CacheObj.hDelValue([callbackControlCacheKey, address], function () {

							printLogs('check for callback ' + address + ' deleted');

						});

					}

				} else {

					printLogs('request error');
					printLogs(error);

				}

			}
		);

	}catch (e) {



	}

}

//
// format response
//
function transformUtxo(utxo) {
	return {
		address: utxo.address,
		txid: utxo.txid,
		vout: utxo.outputIndex,
		ts: utxo.timestamp ? parseInt(utxo.timestamp) : Date.now(),
		scriptPubKey: utxo.script,
		amount: utxo.satoshis / 1e8,
		confirmations: utxo.confirmations
	};
};


function printLogs(messageToPrint) {

	if (typeof messageToPrint === 'string' || messageToPrint instanceof String) {

		console.log(prefixForLogs + ' ' + messageToPrint);

	}else {

		console.log(messageToPrint);

	}

}


//
// flow to check addresses which dont fired
//
function checkAddresses() {

	if (CacheObj != undefined && CacheObj.keys != undefined) {

		CacheObj.keys(callbackControlCacheKey, function (data) {

			async.eachSeries(data, function (address, callbackItem) {

				CacheObj.hmGetValue(callbackControlCacheKey, address, function (timestampWhenSet) {

					var currentTimeStamp = new Date().getTime();

					var diff = currentTimeStamp - timestampWhenSet;

					if (diff > timeOutToCheckAddresses * 2) {

						flowToSendRequest(address, true, null, true);

					}

					callbackItem();

				});

			}, function done() {

				setTimeout(function() {

					checkAddresses();

				}, timeOutToCheckAddresses);

			});

		});

	}

}

setTimeout(function() {

	checkAddresses();

}, timeOutToCheckAddresses);


module.exports = CallbackController;
