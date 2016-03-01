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
var BlockController = require('./blocks');
var TxController = require('./transactions');
var inherits = require('util').inherits;

var bitcore = require('bitcore-lib');
var Transaction = bitcore.Transaction;

var nodeG = {};
var AddressesController = {};
var bus = {};
var CacheObj = {};
var blocks = {};
var transactions = {};

//
// time out to check not sended addresses
//
var timeOutToCheckAddresses = 60000;

//
// confirmations count
//
var achivedConfirmations = [0, 1, 3];

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

//var subscribedChannel = 'address/transaction';
var subscribedChannel = 'db/block';

//
// controller
//
var CallbackController = function (node, addresses) {

	nodeG = node;
	AddressesController = addresses;
	bus = node.openBus();
	CacheObj = new cache();

	blocks = new BlockController(nodeG);
	transactions = new TxController(nodeG);

	CacheObj.keys(callbackCacheKey, function (data) {

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
								status: 'done'
							});

						}
					],
					function () {

					});

			} else {

				res.json({
					status: 'failed'
				});

			}

		} else {

			res.json({
				status: 'failed'
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

			bus.unsubscribe(subscribedChannel, addr);

			res.json({
				status: 'done'
			});

		} else {

			res.json({
				status: 'failed'
			});

		}

	}

};

//
// init subscriptions
//
function proceedSubscribe(addr) {

	bus.unsubscribe(subscribedChannel, addr);

	bus.subscribe(subscribedChannel, addr);

	bus.on(subscribedChannel, function () {

		var results = [];

		for (var i = 0; i < arguments.length; i++) {
			results.push(arguments[i]);
		}

		printLogs('+++ callback fired');
		printLogs(results);

		if (subscribedChannel === 'address/transaction') {

			proceedCallbackUrl(results);

		} else if (subscribedChannel === 'db/block') {

			proceedBlockCallbackUrl(results);

		}

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
//
//
function proceedBlockCallbackUrl(data) {

	//printLogs(data);

	if (data !== undefined && data && data.length) {

		//
		// iterate over blocks
		//
		async.eachSeries(data, function (blockId, callbackBlock) {

			//
			// get block info
			//
			nodeG.getBlock(blockId, function (err, block) {

				if (err && err.message === 'Block not found.') {
					printLogs(err.message);
					callbackBlock();
				} else if (err) {
					printLogs(err);
					callbackBlock();
				}else if (block) {

					//printLogs(blockId);

					var info = nodeG.services.bitcoind.getBlockIndex(blockId);

					//printLogs('info');
					//printLogs(info);

					info.isMainChain = nodeG.services.bitcoind.isMainChain(block);

					var blockInfo = blocks.transformBlock(block, info);

					//printLogs('blockInfo');
					//printLogs(blockInfo);

					if (blockInfo !== undefined &&
						blockInfo &&
						blockInfo.tx !== undefined &&
						blockInfo.tx.length > 0) {

						//
						// iterate over tx arr
						//
						async.eachSeries(blockInfo.tx, function (transactionId, callbackTx) {

							//
							// get DRT transaction
							//
							nodeG.getTransactionWithBlockInfo(transactionId, true, function (err, transaction) {

								printLogs('transactionId');
								printLogs(transactionId);

								if (err && err instanceof nodeG.errors.Transaction.NotFound) {
									printLogs('nodeG.errors.Transaction.NotFound');
									callbackTx();
								} else if (err) {
									printLogs('error here - getTransaction');
									printLogs(err);
									callbackTx();
								} else {

									//
									// transform transaction
									//
									transactions.transformTransaction(transaction, function (err, data) {

										if (err) {

											printLogs('error while transform transaction');
											printLogs(err);
											callbackTx();

										} else if (data) {

											if (data &&
												data.vout !== undefined &&
												data.vout.length) {

												async.eachSeries(data.vout, function (voutItem, callbackVout) {

													printLogs('voutItem data');
													printLogs(voutItem);

													if (voutItem !== undefined &&
														voutItem &&
														voutItem.scriptPubKey !== undefined &&
														voutItem.scriptPubKey.addresses !== undefined &&
														voutItem.scriptPubKey.addresses.length) {

														printLogs('voutItem data addresses are not empty');
														printLogs(voutItem.scriptPubKey.addresses);

														async.eachSeries(voutItem.scriptPubKey.addresses, function (addressDrt, callbackAddr) {

															//console.log(err);
															//console.log(data);
															//console.log(data.vout[0].scriptPubKey);

															flowToSendRequest(addressDrt, false, callbackAddr, false);

														}, function () {

															printLogs('iterate over addresses are finished');
															callbackVout();

														});

													} else {

														printLogs('voutItem addresses are empty');
														callbackVout();

													}

												}, function () {

													callbackTx();

												});

											} else {

												printLogs('vout are empty');
												callbackTx();

											}

										} else {

											printLogs('transformTransaction data are empty');
											callbackTx();

										}

									});

								}

							});

						}, function () {

							printLogs('iterate over tx finished');
							callbackBlock();

						});

					}else {

						printLogs('tx are empty');

					}

				}else {

					callbackBlock();

				}

			});

		}, function() {

			printLogs('iterate over block finished');

		});

	} else {

		printLogs('trying to process callback but array with blocks are empty');

	}

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

			} else {

				printLogs('error with item');
				printLogs(item);

			}

		},
		function () {
		});

};

/*

 addrDrtStr
 dontSetTimeMark - mark
 callbackItem - callback
 anywayTryToSend - mark

 */
function flowToSendRequest(addrDrtStr, dontSetTimeMark, callbackItem, anywayTryToSend) {

	nodeG.getUnspentOutputs(addrDrtStr, true, function (err, utxos) {

		if (err && err instanceof self.node.errors.NoOutputs) {
			//return res.jsonp([]);
			printLogs('no outputs while callback');
		} else if (err) {
			//return common.handleErrors(err, res);
			printLogs('error while callback');
			printLogs(err);
		} else {

			async.eachSeries(utxos, function (itemToSend, callbackItemInner) {

				printLogs('debug logs for itemToSend');
				printLogs(itemToSend);

				async.waterfall([
					function (innerWater) {

						if (itemToSend != undefined &&
							itemToSend.txid != undefined) {

							nodeG.getTransaction(itemToSend.txid, true, function (err, transaction) {

								if (err && err instanceof nodeG.errors.Transaction.NotFound) {
									printLogs('nodeG.errors.Transaction.NotFound');
								} else if (err) {
									printLogs('error here - getTransaction');
									printLogs(err);
								} else {

									CacheObj.hmSetValue(confirmationsKey, transaction.toBuffer().toString('hex'), addrDrtStr, function () {

										innerWater();

									});

								}

							});

						} else {

							innerWater();

						}

					},
					function (innerWater) {

						//callbackControlCacheKey

						if (dontSetTimeMark === true) {

							innerWater();

						} else {

							if (itemToSend != undefined &&
								itemToSend.confirmations != undefined &&
								(achivedConfirmations.indexOf(itemToSend.confirmations) >= 0)) {

								//
								// cache info about transaction
								//
								CacheObj.hmSetValue(callbackControlCacheKey, addrDrtStr, new Date().getTime(), function () {

									innerWater();

								});

							} else {

								innerWater();

							}

						}

					},
					function () {

						if (anywayTryToSend == true || (itemToSend != undefined &&
							itemToSend.confirmations != undefined &&
							(achivedConfirmations.indexOf(itemToSend.confirmations) >= 0))) {

							CacheObj.hmGetValue(callbackCacheKey, addrDrtStr, function (callbackUrl) {

								printLogs('+++ callbackUrl');
								printLogs(addhttp(callbackUrl));
								printLogs(itemToSend);

								makeCallbackRequest(callbackUrl, addrDrtStr, [transformUtxo(itemToSend)]);

								callbackItemInner();

							});

						} else {

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
		confirmations: utxo.confirmations,
		enumCurrency: "BITCOIN"
	};

};

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
				headers: {
					"Content-Type": "application/json"
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

	} catch (e) {


	}

}

function printLogs(messageToPrint) {

	if (typeof messageToPrint === 'string' || messageToPrint instanceof String) {

		console.log(prefixForLogs + ' ' + messageToPrint);

	} else {

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

				setTimeout(function () {

					checkAddresses();

				}, timeOutToCheckAddresses);

			});

		});

	}

}

setTimeout(function () {

	checkAddresses();

}, timeOutToCheckAddresses);


module.exports = CallbackController;
