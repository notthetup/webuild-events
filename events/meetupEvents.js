'use strict';

var querystring = require('querystring');
var prequest = require('prequest');
var utils = require('./utils');
var clc = require('cli-color');

module.exports = function (config) {
  var blacklistGroups = config.meetupParams.blacklistGroups || [];
  var blacklistWords = config.meetupParams.blacklistWords || [];
  var blacklistRE = new RegExp(blacklistWords.join('|'), 'i');

  function constructAddress(venue) {
    var address = '';

    if (venue) {
      address = [
        venue.name,
        ', ',
        venue.address_1 || '',
        (venue.address_2 ? ', ' + venue.address_2 : '')
      ].join('');
      address += address.indexOf(config.meetupParams.city) === -1 ? ', ' + config.meetupParams.city : '';
    } else {
      address = config.meetupParams.city;
    }

    return address;
  }

  function isValidGroup(row) {
    var isValidCountry = row.country === (config.meetupParams.country || row.country);
    var isValidText = blacklistWords.length === 0 || !(row.name.match(blacklistRE) || (row.description !== undefined && row.description.match(blacklistRE)));

    if (row.name && row.description) {
      isValidText = blacklistWords.length === 0 ? true : !(row.name.match(blacklistRE) || row.description.match(blacklistRE));
    } else {
      isValidText = false;
    }

    var isValidGroupId = !blacklistGroups.some(function(id) { return row.id === id });

    return isValidCountry && isValidText && isValidGroupId;
  }

  function isFree(event) {
    return !event.fee;
  }

  function normalizeGroupEvents(events, row) {

    var eventTime;
    var event = {};

    if (!isFree(row)) {
      return events;
    }

    if (!row.hasOwnProperty('venue') || row.venue_visibility === 'members') {
      return events;
    }

    if (row.duration === undefined) {
      row.duration = 7200000
    }

    eventTime = utils.localTime(row.time, config.timezone);

    event = {
      id: row.id,
      name: row.name,
      description: utils.htmlStrip(row.description),
      location: constructAddress(row.venue),
      url: row.event_url,
      group_id: row.group.id,
      group_name: row.group.name,
      group_url: 'http://meetup.com/' + row.group.urlname,
      formatted_time: utils.formatLocalTime(row.time, config.timezone, config.displayTimeformat),
      start_time: eventTime.toISOString(),
      end_time: eventTime.add(row.duration, 'milliseconds').toISOString(),
      yes_rsvp_count: row.yes_rsvp_count
    }

    events.push(event);
    return events;
  }

  // getEventsByGroupIds returns an array of events
  // for the provided groups.
  function getEventsByGroupIds(groupIds) {
    var url = 'https://api.meetup.com/2/events/?' +
    querystring.stringify({
      key: config.meetupParams.key,
      group_id: groupIds.join(',')
    });

    return prequest(url).then(function(data) {
      var events = [];
      data.results.reduce(normalizeGroupEvents, events);
      console.log(clc.blue('Info: Found ' + events.length + ' meetup.com group events with venues'));
      return events;
    }).catch(function(err) {
      console.error(clc.red('Error: getEventsByGroupIds():'));
      console.error(clc.red(err));
    });
  }

  // getGroupIds returns an array of group IDs
  // matching the given criteria.
  function getGroupIds() { //regardless of venue
    var url = 'https://api.meetup.com/2/groups?' +
      querystring.stringify(config.meetupParams);

    return prequest(url).then(function(data) {
      console.log(clc.blue('Info: Found ' + data.results.length + ' meetup.com groups'));
      return data.results
        .filter(isValidGroup)
        .reduce(function(groupIds, row) {
          groupIds.push(row.id);
          return groupIds;
        }, []);
    }).catch(function(err) {
      console.error(clc.red('Error: getGroupIds():'));
      console.error(clc.red(err));
    });
  }

  return {
    'get': function () {
      return getGroupIds()
      .then(function(groupIds) {
        return getEventsByGroupIds(groupIds);
      })
      .catch(function(err) {
        console.error(clc.red('Error: getGroupEvents():'));
        console.error(clc.red(err));
      });
    }
  }
}
