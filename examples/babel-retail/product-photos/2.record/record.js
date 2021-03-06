'use strict';

var aws = require('aws-sdk'); // eslint-disable-line import/no-unresolved, import/no-extraneous-dependencies


var dynamo = new aws.DynamoDB.DocumentClient();
var constants = {
  MODULE: 'record.js',
  METHOD_PUT_ASSIGNMENT: 'putToken',
  RECEIVE_ACTIVITY_ARN: 'ACTIVITY_RECEIVE_ARN',
  TABLE_PHOTO_ASSIGNMENTS_NAME: 'PHOTO_ASSIGNMENTS_TABLE'
};
var impl = {
  putAssignment: function putAssignment(event, task, callback) {
    var updated = Date.now();
    var dbParams = {
      TableName: constants.TABLE_PHOTO_ASSIGNMENTS_NAME,
      Key: {
        number: event.photographer.phone
      },
      UpdateExpression: ['set', '#c=if_not_exists(#c,:c),', '#cb=if_not_exists(#cb,:cb),', '#u=:u,', '#ub=:ub,', '#tt=:tt,', '#te=:te,', '#st=:st'].join(' '),
      ExpressionAttributeNames: {
        '#c': 'created',
        '#cb': 'createdBy',
        '#u': 'updated',
        '#ub': 'updatedBy',
        '#tt': 'taskToken',
        '#te': 'taskEvent',
        '#st': 'status'
      },
      ExpressionAttributeValues: {
        ':c': updated,
        ':cb': event.origin,
        ':u': updated,
        ':ub': event.origin,
        ':tt': task.taskToken,
        ':te': task.input,
        ':st': 'pending'
      },
      ReturnValues: 'NONE',
      ReturnConsumedCapacity: 'NONE',
      ReturnItemCollectionMetrics: 'NONE'
    };
    dynamo.update(dbParams, function (err) {
      if (err) {
        callback("".concat(constants.MODULE, " ").concat(constants.METHOD_PUT_ASSIGNMENT, " - error updating DynamoDb: ").concat(err));
      } else {
        // second update result if error was not previously seen
        callback();
      }
    });
  } // Example event:
  // {
  //   schema: 'com.nordstrom/retail-stream/1-0-0',
  //   origin: 'hello-retail/product-producer-automation',
  //   timeOrigin: '2017-01-12T18:29:25.171Z',
  //   data: {
  //     schema: 'com.nordstrom/product/create/1-0-0',
  //     id: 4579874,
  //     brand: 'POLO RALPH LAUREN',
  //     name: 'Polo Ralph Lauren 3-Pack Socks',
  //     description: 'PAGE:/s/polo-ralph-lauren-3-pack-socks/4579874',
  //     category: 'Socks for Men',
  //   }
  // }

};

exports.handler = function (event, context, callback) {
  // console.log(JSON.stringify(event));
  impl.putAssignment(event, {taskToken: TAJS_make('AnyStr'), input: TAJS_make('AnyStr')}, function (putErr) {
        callback(null, event);
      });
};

exports.handler({photographer: {phone: TAJS_make('AnyStr')}, origin: TAJS_make('AnyStr')}, null, function () {});