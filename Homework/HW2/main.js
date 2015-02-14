var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var faker = require("faker");
//Random = require('random-js')
var fs = require("fs");
faker.locale = "en";
var mock = require('mock-fs');
var _ = require('underscore');

function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		args = ["subject.js"];
	}
	var filePath = args[0];

	constraints(filePath);

	generateTestCases()
	//fakeDemo();
}


function fakeDemo()
{
	//console.log("---------------fake")
	console.log( faker.phone.phoneNumber() );
	console.log( faker.phone.phoneNumberFormat() );
	console.log( faker.phone.phoneFormats() );
}

var functionConstraints =
{
}

var mockFileLibrary = 
{
	pathExists:
	{
		'path/fileExists': {}
	},

	fileWithContent:
	{
		pathContent: 
		{	
  			file1: 'text content',
		}
	},
	fileWithNoContent:
	{
		pathContent: 
		{	
  			file1: '',
		}
	},

	fileDoesNotExist:
	{
		pathContent: 
		{	
  			file2: '',
		}
	}
};

function generateTestCases()
{

	var content = "var subject = require('./subject.js')\nvar mock = require('mock-fs');\nvar faker = require('faker');\n";
	for ( var funcName in functionConstraints )
	{
		var params = {};

		// initialize params
		for (var i =0; i < functionConstraints[funcName].params.length; i++ )
		{
			var paramName = functionConstraints[funcName].params[i];
			params[paramName] = '\'' + faker.phone.phoneNumber()+'\'';
			params[paramName] = '\'\'';
		}

		// update parameter values based on known constraints.
		var constraints = functionConstraints[funcName].constraints;
		// Handle global constraints...
		var fileWithContent = _.some(constraints, {mocking: 'fileWithContent' });
		var pathExists      = _.some(constraints, {mocking: 'fileExists' });
		var fileDoesNotExist= _.some(constraints, {mocking: 'fileWithContent'});
		//var inverse;
		var phone = _.contains(functionConstraints[funcName].params, "phoneNumber");


		for( var c = 0; c < constraints.length; c++ )
		{
			var constraint = constraints[c];
			if( params.hasOwnProperty( constraint.ident ))
			{

				if(constraint.inverse!=null)
				{
					params[constraint.ident]= constraint.inverse;
					var args = Object.keys(params).map( function(k) {return params[k]; }).join(",");
					content += "subject.{0}({1});\n".format(funcName, args );
				}

				params[constraint.ident] =   constraint.value ;
				//inverse=constraint.inverse;
				//console.log(inverse);
			}
		}

		// Prepare function arguments.
		
		var args = Object.keys(params).map( function(k) {return params[k]; }).join(",");
		if( pathExists || fileWithContent )
		{
			content += generateMockFsTestCases(pathExists,fileWithContent,!fileDoesNotExist,funcName, args);
			// Bonus...generate constraint variations test cases....
			content += generateMockFsTestCases(!pathExists,!fileWithContent,!fileDoesNotExist,funcName, args);
			content += generateMockFsTestCases(pathExists,!fileWithContent,!fileDoesNotExist,funcName, args);
			content += generateMockFsTestCases(!pathExists,!fileWithContent,!fileDoesNotExist,funcName, args);
			content += generateMockFsTestCases(pathExists,!fileWithContent,fileDoesNotExist,funcName, args);
		}
		else if(phone){
			for(var i = 0; i<2; i++){
					for(param in params){
						if(param.indexOf('phoneNumber') > -1){
							params[param] = "faker.phone.phoneNumberFormat()";
							
						} else if(param.indexOf('options') > -1){
							params[param] = '"option"';
						}
					}

					var args = _.map(params, function(value, key, list){
						return value;
					}).join(",");
					content += "subject.{0}({1});\n".format(funcName, args );
			}
			for(param in params){
				if(param.indexOf('phoneNumber') > -1){
					params[param] = "'212-111-111'";
				}else if(param.indexOf('options') > -1){
					params[param] = '{"normalize": true}';
				}
				var args = _.map(params, function(value, key, list){
					return value;
				}).join(",");
				content += "subject.{0}({1});\n".format(funcName, args );
			}
		}
		else
		{
			// Emit simple test case.
			content += "subject.{0}({1});\n".format(funcName, args );
		}

	}

	//test case for blacklisted area code
	//content += "subject.{0}({1});\n".format('blackListNumber', "'2121111111'" );
	fs.writeFileSync('test.js', content, "utf8");

}

function generateMockFsTestCases (pathExists,fileWithContent,fileDoesNotExist,funcName,args) 
{
	var testCase = "";
	// Insert mock data based on constraints.
	var mergedFS = {};
	if( pathExists )
	{
		for (var attrname in mockFileLibrary.pathExists) { mergedFS[attrname] = mockFileLibrary.pathExists[attrname]; }
		
		// if(fileDoesNotExist)
		// 	//console.log("------------------file nahi milat ahe")
		// 	for (var attrname in mockFileLibrary.fileDoesNotExist) { mergedFS[attrname] = mockFileLibrary.fileDoesNotExist[attrname]; }
	}
	if(pathExists && fileDoesNotExist)
	{
			for (var attrname in mockFileLibrary.pathExists) { mergedFS[attrname] = mockFileLibrary.pathExists[attrname]; }
			for (var attrname in mockFileLibrary.fileDoesNotExist) { mergedFS[attrname] = mockFileLibrary.fileDoesNotExist[attrname]; }
		
	}
	else{
	if( fileWithContent )
	{
		for (var attrname in mockFileLibrary.fileWithContent) { mergedFS[attrname] = mockFileLibrary.fileWithContent[attrname]; }
	}
	//if(!fileWithContent)
	else
	{
		for (var attrname in mockFileLibrary.fileWithNoContent) { mergedFS[attrname] = mockFileLibrary.fileWithNoContent[attrname]; }
	}
}

	testCase += 
	"mock(" +
		JSON.stringify(mergedFS)
		+
	");\n";

	testCase += "\tsubject.{0}({1});\n".format(funcName, args );
	testCase+="mock.restore();\n";
	return testCase;
}

function constraints(filePath)
{
   var buf = fs.readFileSync(filePath, "utf8");
	var result = esprima.parse(buf, options);

	traverse(result, function (node) 
	{
		if (node.type === 'FunctionDeclaration') 
		{
			var funcName = functionName(node);
			//console.log("Line : {0} Function: {1}".format(node.loc.start.line, funcName ));
			var params = node.params.map(function(p) {return p.name});

			functionConstraints[funcName] = {constraints:[], params: params};

			// Check for expressions using argument.
			traverse(node, function(child)
			{
				if( child.type === 'BinaryExpression' && child.operator == "==")
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						// get expression from original source code:
						//var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])
						functionConstraints[funcName].constraints.push( 
							{
								ident: child.left.name,
								value: rightHand,
								inverse: Math.random()
							});

					}
				}

				if( child.type === 'BinaryExpression' && child.operator == "<" )
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						// get expression from original source code:
						//var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])
						
						functionConstraints[funcName].constraints.push( 
							{
								ident: child.left.name,
								value: Math.floor((Math.random() * (rightHand - 1) + (rightHand - 10))),
								//value: Math.random( rightHand - 10, rightHand -1 ),
   								inverse: Math.floor(Math.random() * (rightHand))
							});	
					}
				}
				if(child.type === 'LogicalExpression' && child.operator == "||" )
				{
					if( child.left.argument.type == 'Identifier' && params.indexOf( child.left.argument.name ) > -1)
						//console.log("----LogicalExpression--")
						functionConstraints[funcName].constraints.push( 
							{
								ident: child.left.argument.name,
								value: false,
								inverse: true
								
							});	

						if( child.right.argument.type == 'MemberExpression' && params.indexOf( child.right.argument.name ) > -1)
						//console.log("----LogicalExpression--")
						functionConstraints[funcName].constraints.push( 
							{
								ident: child.left.argument.name,
								value: false,
								inverse: true
								
							});						
				}

				if( child.type == "CallExpression" && 
					 child.callee.property &&
					 child.callee.property.name =="readFileSync" )
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							{
								// A fake path to a file
								ident: params[p],
								value: "'pathContent/file1'",
								mocking: 'fileWithContent'
							});
						}
					}
				}

				if( child.type == "CallExpression" &&
					 child.callee.property &&
					 child.callee.property.name =="existsSync")
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							{
								// A fake path to a file
								ident: params[p],
								value: "'path/fileExists'",
								mocking: 'fileExists'
							});
						}
					}
				}

				//if(child.type === "" ) 

			});

			console.log( functionConstraints[funcName]);

		}
	});
}

function traverse(object, visitor) 
{
    var key, child;

    visitor.call(null, object);
    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null) {
                traverse(child, visitor);
            }
        }
    }
}

function traverseWithCancel(object, visitor)
{
    var key, child;

    if( visitor.call(null, object) )
    {
	    for (key in object) {
	        if (object.hasOwnProperty(key)) {
	            child = object[key];
	            if (typeof child === 'object' && child !== null) {
	                traverseWithCancel(child, visitor);
	            }
	        }
	    }
 	 }
}

function functionName( node )
{
	if( node.id )
	{
		return node.id.name;
	}
	return "";
}


if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

main();