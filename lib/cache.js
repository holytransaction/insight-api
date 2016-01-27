/**
 * Created by deniskashuba on 12.11.15.
 */
var redis 				= require("redis");
var inherits 			= require("inherits-js");

function AbstractCache() {
//
}

AbstractCache.prototype = {

	client: {},

	setValue: function(key, value, callback) {
		throw new TypeError("Method not implemented");
	},

	getValue: function(key, callback) {
		throw new TypeError("Method not implemented");
	}

};

AbstractCache.extend = function(prototypeProperties) {

	return inherits(this, prototypeProperties);

};

var RedisCache = AbstractCache.extend({

	constructor: function(options) {

		if (process.env.REDISTOGO_URL) {
			console.log("Found Redis URL");
			var rtg   = require('url').parse(process.env.REDISTOGO_URL);
			this.client = require('redis').createClient(rtg.port, rtg.hostname);
			this.client.auth(rtg.auth.split(':')[1])  // auth 1st part is username and 2nd is password separated by ":"
		}
// Localhost
		else {
			console.log("WARNING: Local Redis assumed");
			this.client = redis.createClient();
		}

		this.client.on("error", function (err) {
			console.log("Error " + err);
		});

	},

	keys: function(hash, callback) {

		this.client.hkeys(hash, function(err, data) {

			if (err)
				console.log('error while hkeys value in cache');
			else {

				if (callback)
					callback(data);
				else
					console.log('error while hkeys value in cache');

			}

		});

	},

	hDelValue: function(key, callback) {

		this.client.hdel(key, function(err, data) {

			if (err)
				console.log('error while deleting value in cache');
			else {

				if (callback)
					callback();

			}

		});

	},

	delValue: function(key, callback) {

		this.client.del(key, function(err, data) {

			if (err)
				console.log('error while deleting value in cache');
			else {

				if (callback)
					callback();

			}

		});

	},

	setexValue: function(key, timems, value, callback) {

		this.client.setex(key, timems, value, function(err, data) {

			if (err)
				console.log('error while setting value in cache');
			else {

				if (callback)
					callback();

			}

		});

	},

	setValue: function(key, value, callback) {

		this.client.set(key, value, function(err, data) {

			if (err)
				console.log('error while setting value in cache');
			else {

				if (callback)
					callback();

			}

		});

	},

	hmSetValue: function(key, hkey, value, callback) {

		this.client.hmset(key, hkey, value, function(err, data) {

			if (err)
				console.log('error hm setting value');
			else {

				//LoggerObj.logIntel('!_*(&^)^() CACHE setting ' + key + ' was ' + data, 'debug');

				if (callback)
					callback();

			}

		});

	},

	getValue: function(key, callback) {

		this.client.get(key, function (err, reply) {

			if (err)
				console.log('error while getting data from cache');
			else {

				if (callback && reply) {

					callback(reply.toString());

				}else {

					//LoggerObj.logIntel(['reply null with key ' + key], 'error');
					callback(null);

				}

			}

		});

	},

	hmGetValue: function(key, hkey, callback) {

		this.client.hmget(key, hkey, function (err, reply) {

			if (err)
				console.log('error while getting hm data from cache');
			else {

				if (callback && reply && reply[0] != null) {

					callback(reply.toString());

				}else {

					//LoggerObj.logIntel(['reply null with key ' + key], 'error');
					callback(null);

				}

			}

		});

	},

	hmGetAll: function(key, callback) {

		this.client.hgetall(key, function (err, reply) {

			if (err)
				console.log('error while getting hm all data from cache');
			else {

				if (callback && reply) {

					callback(JSON.stringify(reply));

				} else {

					//LoggerObj.logIntel(['reply null with key ' + key], 'error');
					callback(null);

				}

			}

		});

	}

});
module.exports = RedisCache;
