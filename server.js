var express = require('express');
var app = express();
var session =require('cookie-session');
var bodyParser = require('body-parser');
var fileUpload = require('express-fileupload');
var formidable = require('formidable');
var assert = require('assert');
var MongoClient = require('mongodb').MongoClient;
var fs = require('fs');
var rand = require("random-key");
var mongourl = "mongodb://test:test@ds113826.mlab.com:13826/s381f";
//var mongourl = "mongodb://test:test@localhost:27017/s381f"

app.set('view engine', 'ejs');
app.set('trust proxy', 1);

app.use(fileUpload());
app.use(express.static(__dirname + '/public'));

app.use(session({
	name: 'session',
	keys: ['authenticated','userid']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/user/login',function(req,res) {
	console.log('post');

	var criteria = {"name": req.body.user.userid, "password": req.body.user.password};

	MongoClient.connect(mongourl, function(err,db) {
        assert.equal(err,null);
        console.log('Connected to MongoDB');
        findUsers(db,criteria,function(users) {
			db.close();
			console.log('Disconnected MongoDB');
			/*
			res.writeHead(200,{"Content-Type" : "application/json"});
			res.end(JSON.stringify(records));
			*/
			//console.log(JSON.stringify(users));
			if (users.length > 0) {
				req.session.authenticated = true;
				req.session.userid = req.body.user.userid;
				res.render('msg_href.ejs',{title:'Login Success', msg:'Hello! '+req.session.userid+'.', path:'/', btnName:'OK'});
			} else {
				res.render('msg_back',{title:'Login Failed', msg:'Incorrect User ID or Password.'});
			}
		});
	});

	/*
	var name = "test";
	var pw = "test";
	if (name == req.body.user.userid && pw == req.body.user.password) {
		req.session.authenticated = true;
		req.session.userid = name;
	}
	res.redirect('/');
	*/
});

app.get('/user/login',function(req,res) {
	//res.sendFile(__dirname + '/views/login.html');
	res.render('userForm',{title:'Login', path:'/user/login'});
});

app.get('/user/logout',function(req,res) {
	req.session = null;
	res.redirect('/');
});

app.get('/user/create', function(req,res){
	//res.sendFile(__dirname + '/views/Register.html');
	res.render('userForm',{title:'Register', path:'/user/create'});
});

app.post('/user/create', function(req,res) {
	var criteria = {"name": req.body.user.userid};

	MongoClient.connect(mongourl, function(err,db) {
        assert.equal(err,null);
        console.log('Connected to MongoDB');
        findUsers(db,criteria,function(users) {
			if (users.length > 0) {
				res.render('msg_back', {title:'Create User Failed',msg:'Existed User. Try another user name.'});
			} else {
				var randomString = rand.generate(40);
				var criteria2 = {"name":req.body.user.userid, "password": req.body.user.password, "api_key": randomString};
				insertUser(db, criteria2, function(err) {
					if (err) {
						res.render('msg_back', {title:'Create User Failed',msg:'Networking Error. Please try again.'});
					} else {
						res.render('msg_href', {title:'Create User Success' ,msg:'Create user success, user name: '+req.body.user.userid, path:'/user/login', btnName:'Login Page'});
					}
				});
			}
		});
	});
});

app.get('/user/read', function(req,res){
	//res.sendFile(__dirname + '/views/Register.html');
	//res.render('userForm',{title:'Register', path:'/user/create'});
});

app.get('/restaurant/create',function(req,res) {
	if (!(isLogin(req))){
		res.redirect('/login');
	}
	res.render('createRestaurant', {path:'/restaurant/create'} );
})

app.post('/restaurant/create',function(req,res) {
	if (req.body.name) {
		var restaurant = getFormattedRestaurant(req.body, req.files, req.session.userid);
		console.log('formatted restaurant: '+JSON.stringify(restaurant));
		MongoClient.connect(mongourl, function(err,db) {
	        assert.equal(err,null);
	        console.log('Connected to MongoDB');
	        insertRestaurant(db, restaurant, function(err, result){
	        	if (err) {
					res.render('msg_back', {title:'Create Restaurant Failed',msg:'Networking Error. Please try again.'});
				} else {
					res.render('msg_href', {title:'Create Restaurant Success' ,msg:'Create restaurant success, _id: '+result.ops[0]._id,path:'/restaurant/create',btnName:'Create Another One'});
				}
	        });
			db.close();
			console.log('Disconnected MongoDB');
		});
	} else {
		res.render('msg_back', {title:'Create Restaurant Failed',msg:'restaurant name is required. Please try again.'});
	}
})

app.post('/restaurant/rate', function(req,res){
	console.log('scores: '+JSON.stringify(req.body));
	var score = req.body.score;
	var id = req.body.restaurant_id;
	if (score && !(isNaN(score))) {
		console.log('has score, is number');
		score = parseInt(score);
		if (score > 0 && score <=10) {
			console.log('has score, is valid number');
			MongoClient.connect(mongourl, function(err,db) {
				assert.equal(err,null);
				console.log('Connected to MongoDB');
				var user = req.body.user;
				insertRestaurantGrade(db,id,score,user,function(err) {
					if (err) {
						res.render('msg_href', {title:'Rate Failed' ,msg:'Rate restaurant failed. *score should be (0-10)',path:'/restaurant/detail?restaurant_id='+id,btnName:'Back'});
					} else {
						res.render('msg_href', {title:'Rate Success' ,msg:'Rate restaurant success.',path:'/restaurant/detail?restaurant_id='+id,btnName:'Back'});
					}
				});
				db.close();
				console.log('Disconnected MongoDB');
			});
		} else {
			res.render('msg_href', {title:'Rate Failed' ,msg:'Rate restaurant failed. *score should be (0-10)',path:'/restaurant/detail?restaurant_id='+id,btnName:'Back'});
		}
	} else {
		res.render('msg_href', {title:'Rate Failed' ,msg:'Rate restaurant failed. *score should be (0-10)',path:'/restaurant/detail?restaurant_id='+id,btnName:'Back'});
	}
})

app.post('/restaurant/update', function(req,res){
	//res.writeHead(200,{"Content-Type" : "application/json"});
	//res.write(JSON.stringify(req.body));
	var restaurant = getFormattedRestaurantForUpdate(req.body, req.files);
	MongoClient.connect(mongourl, function(err,db) {
		console.log('Connected to MongoDB');
		assert.equal(err,null);
		var id = req.body.restaurant_id;
		
		updateRestaurant(db,id,restaurant,function(err) {
			if (err) {
				res.render('msg_href', {title:'Edit Failed' ,msg:'Edit restaurant failed.',path:'/restaurant/detail?restaurant_id='+id,btnName:'Back'});
			} else {
				res.render('msg_href', {title:'Changes Saved' ,msg:'Changes is saved successfully.',path:'/restaurant/detail?restaurant_id='+id,btnName:'Back'});
			}
		});
		
		db.close();
		console.log('Disconnected MongoDB');
	});
})

app.post('/restaurant/delete', function(req,res){
	var id = req.body.restaurant_id;
	var criteria = {"restaurant_id":req.body.restaurant_id};
	MongoClient.connect(mongourl, function(err,db) {
		console.log('Connected to MongoDB');
		assert.equal(err,null);
		deleteRestaurant(db,criteria,function(err) {
			if (err) {
				res.render('msg_href', {title:'Delete Failed' ,msg:'Delete Failed.',path:'/restaurant/detail?restaurant_id='+id,btnName:'Back'});
			} else {
				res.render('msg_href', {title:'Delete Success' ,msg:'Restaurant Deleted successfully.',path:'/restaurant/read',btnName:'Back To List'});
			}
		});
		db.close();
		console.log('Disconnected MongoDB');
	});
})

// curl -H "Content-Type: application/json" -d '{"name":"sss","borough":"","cuisine":"","photo":"","photo_mimetype":"","address":{"street":"","building":"","zipcode":"","coord":["sss",""]},"grades":{"score":""}}' http://localhost:8099/api/restaurant/create
app.post('/api/restaurant/create',function(req,res) {
	//console.log('post data: '+JSON.stringify(req.body));
	//console.log('post data: '+JSON.stringify(req.files));
	var owner = "Marco";
	if (req.body.name && owner) {
		var file = (req.files) ? req.files : "";
		var restaurant = getFormattedRestaurant(req.body,file, owner);
		console.log('restaurant: '+JSON.stringify(restaurant));
		MongoClient.connect(mongourl, function(err,db) {
			assert.equal(err,null);
			console.log('Connected to MongoDB');
			insertRestaurant(db, restaurant, function(err, result){
				if (err) {
					var response = {};
					response['status'] = 'failed';
					res.writeHead(200,{"Content-Type" : "application/json"});
					res.end(JSON.stringify(response));
				} else {
					var response = {};
					response['status'] = 'ok'; 
					response['_id'] = result.ops[0]._id;
					res.writeHead(200,{"Content-Type" : "application/json"});
					res.end(JSON.stringify(response));
				}
			});
			db.close();
			console.log('Disconnected MongoDB');
		});
	} else {
		var response = {};
		response['status'] = 'failed';	
		res.writeHead(200,{"Content-Type" : "application/json"});
		res.end(JSON.stringify(response));
	}
})

app.get('/restaurant/read',function(req,res) {
	if (!(isLogin(req))){
		res.redirect('/user/login');
	}
	MongoClient.connect(mongourl, function(err,db) {
        assert.equal(err,null);
        var projection = {"restaurant_id":1,"name":1,"_id":0};
        var criteria = {};
        console.log('Connected to MongoDB');
		findRestaurantsName(db,criteria,projection,function(restaurants) {
			//console.log('restaurants: '+JSON.stringify(restaurants));
			res.render('restaurantsList',{title:'Restaurants',restaurants:restaurants})
		});
		db.close();
		console.log('Disconnected MongoDB');
	});
})

app.get('/restaurant/detail',function(req,res){
	if (!(isLogin(req))){
		res.redirect('/user/login');
	}
	if (!(req.query.restaurant_id)) {
		res.redirect('/restaurant/read');
	}
	MongoClient.connect(mongourl, function(err,db) {
        assert.equal(err,null);
        var criteria = {"restaurant_id":req.query.restaurant_id};
        console.log('Connected to MongoDB');
		findRestaurant(db,criteria,function(restaurants) {
			//console.log('restaurant '+JSON.stringify(restaurants));
			var isGraded = false;
			for (i in restaurants) {
				for (j in restaurants[i].grades) {
					if (restaurants[i].grades[j].user == req.session.userid) {
						isGraded = true;
					}
				}
			}
			res.render('restaurantDetail',{r:restaurants[0],cu:req.session.userid, isGraded:isGraded});
		});
		db.close();
		console.log('Disconnected MongoDB');
	});
})

app.get('/',function(req,res) {
	if (!(isLogin(req))){
		res.redirect('/user/login');
	}
	var paths = [];
	paths.push({"name": "Create", "path": "/restaurant/create"});
	paths.push({"name": "View", "path": "/restaurant/read"});
	res.render('index',{paths:paths, logoutPath:'/user/logout',title:'Restaurants Manager'})
});

function findUsers(db,criteria,callback) {
	var cursor = db.collection("users").find(criteria);
	var users = [];
	cursor.each(function(err,doc) {
		assert.equal(err,null);
		if (doc != null) {
			users.push(doc);
		} else {
			callback(users);
		}
	});
}

function insertUser(db,user,callback) {
	db.collection('users').insertOne(user,function(err,result) {
		assert.equal(err,null);
		callback(err);
	});
}

function insertRestaurant(db,restaurant,callback) {
	db.collection('restaurants').insert(restaurant,function(err,result) {
		assert.equal(err,null);
		callback(err, result);
	});
}

function insertRestaurantGrade(db,id,score,user,callback) {
	var grade = {"user":user,"score":score};
	db.collection('restaurants').findAndModify(
		{"restaurant_id":id},
		[],
		{$push: {"grades":grade}},
		{},
		function(err) {
			callback(err);
		}
	);
}

function updateRestaurant(db,id,restaurant,callback) {
	db.collection('restaurants').findAndModify(
		{"restaurant_id":id},
		[],
		{$set: restaurant},
		{},
		function(err) {
			callback(err);
		}
	);
}	

function deleteRestaurant(db,criteria,callback) {
	db.collection('restaurants').remove(criteria,function(err) {
		assert.equal(err,null);
		callback(err);
	});
}

function findRestaurantsName(db,criteria,projection,callback) {
	var cursor = db.collection("restaurants").find(criteria).project(projection);
	var restaurants = [];
	cursor.each(function(err,doc) {
		assert.equal(err,null);
		if (doc != null) {
			restaurants.push(doc);
		} else {
			callback(restaurants);
		}
	});
}

function findRestaurant(db,criteria,callback) {
	var cursor = db.collection("restaurants").find(criteria);
	var restaurants = [];
	cursor.each(function(err,doc) {
		assert.equal(err,null);
		if (doc != null) {
			restaurants.push(doc);
		} else {
			callback(restaurants);
		}
	});
}

function isLogin(req) {
	if (req.session.length == 0 ) {
		return false;
	} else {
		return true;
	}
}

/*
function checkLoginAndRedirect(req,res) {
	if (req.session.length == 0 ) {
		//console.log('session: '+JSON.stringify(req.session));
		res.redirect('/login');
	} else {
		//console.log('session: '+JSON.stringify(req.session));
	}
}
*/

function getFormattedRestaurant(body, files, owner) {
	var restaurant = {};
	restaurant['restaurant_id'] = Math.floor((Math.random() * 89999999)+10000000)+'';
	restaurant['name'] = body.name;
	restaurant['borough'] = (body.borough) ? body.borough : "";
	restaurant['cuisine'] = (body.cuisine) ? body.cuisine : "";

	restaurant['address'] = {};

	restaurant['address']['street'] = (body.street) ? body.street : "";
	restaurant['address']['building'] = (body.building) ? body.building : "";
	restaurant['address']['zipcode'] = (body.zipcode) ? body.zipcode : "";

	restaurant['photo'] = '';
	restaurant['photo_mimetype'] = '';

	if (files.photo) {
		restaurant['photo'] = files.photo.data.toString('base64');
		restaurant['photo_mimetype'] = files.photo.mimetype
	}

	restaurant['address']['coord'] = [];
	if ( (body.lat) && (body.lon) ) {
		restaurant['address']['coord'][0] = Number(body.lat);
		restaurant['address']['coord'][1] = Number(body.lon);
	}
	//console.log('coord[0]'+restaurant['address']['coord'][0]);
	//console.log('coord[1]'+restaurant['address']['coord'][1]);
	restaurant['grades'] = [];
	var score = body.score;
	if (score && !isNaN(score) ) {
		score = parseInt(score);
		if (score > 0 && score <= 10) {
			restaurant['grades'][0] = {};
			restaurant['grades'][0]['user'] = owner;
			restaurant['grades'][0]['score'] = parseInt(body.score);
		}
	}
	restaurant['owner'] = owner;

	return restaurant;
}

function getFormattedRestaurantForUpdate(body, files) {
	var restaurant = {};
	restaurant['name'] = body.name;
	restaurant['borough'] = body.borough;
	restaurant['cuisine'] = body.cuisine;

	restaurant['address'] = {};
	restaurant['address']['street'] = body.street;
	restaurant['address']['building'] = body.building;
	restaurant['address']['zipcode'] = body.zipcode;

	restaurant['photo'] = '';
	restaurant['photo_mimetype'] = '';

	if (files.photo) {
		restaurant['photo'] = files.photo.data.toString('base64');
		restaurant['photo_mimetype'] = files.photo.mimetype
	}

	restaurant['address']['coord'] = [];
	if ( (body.lat) && (body.lon) ) {
		restaurant['address']['coord'][0] = Number(body.lat);
		restaurant['address']['coord'][1] = Number(body.lon);
	}
	
	return restaurant;
}

/*
app.get('/allUsers', function(req,res) {
	MongoClient.connect(mongourl, function(err,db) {
        assert.equal(err,null);
        console.log('Connected to MongoDB');
        findUsers(db,{},function(users) {
			db.close();
			console.log('Disconnected MongoDB');
			
			//res.writeHead(200,{"Content-Type" : "application/json"});
			//res.end(JSON.stringify(records));
			
			console.log(JSON.stringify(users));
		});
	});
	res.end();
})
*/

/*
function abc() {
	var restaurant = {};
	var name = 'starbucks';
	if (name) {
		restaurant['name'] = name;
	}
	console.log(JSON.stringify(restaurant));
}
*/
app.listen(app.listen(process.env.PORT || 8099));