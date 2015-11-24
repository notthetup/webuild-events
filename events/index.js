'use strict';

var moment = require('moment-timezone');
var overlap = require('word-overlap');
var clc = require('cli-color');
var eventsResult = {
  'meta': {},
  'events': []
};

module.exports = function(config) {
  var whitelistEvents = config.whitelistEvents;
  var blacklistEvents = config.blacklistEvents;
  var API = {
    getFacebookEvents: require('./facebookEvents')(config).get,
    getMeetupEvents: require('./meetupEvents')(config).get,
    getEventbriteEvents: require('./eventbriteEvents')(config).get,
    getIcsEvents: require('./icsEvents')(config).get
  };

  function isDuplicateEvent(event1, event2) {
    var options = {
      ignoreCase: true,
      ignoreCommonWords: true,
      ignoreNumber: true,
      common: config.ignoreWordsInDuplicateEvents.concat(config.city.toLowerCase()),
      depluralize: true
    };

    var overlappedEventName = overlap(event1.name, event2.name, options);
    var overlappedEventLocation = overlap(event1.location, event2.location, options);
    var overlappedEventDescription = overlap(event1.description, event2.description, options);

    if ((event1.formatted_time === event2.formatted_time) &&
      (event1.name === event2.name)) {
      // console.log(clc.magenta('Info: Duplicate event added: ' + event2.url));
      // console.log(clc.magenta('Info: Duplicate event overlaps: ' + overlappedEventDescription));
      // console.log(clc.magenta('-----------'))
      return true;
    }

    if ((event1.formatted_time === event2.formatted_time) &&
        (overlappedEventLocation.length > 0)) {
      if (overlappedEventName.length > 0 || overlappedEventDescription.length > 2) {
        console.log(clc.magenta('Info: Duplicate event removed [' + overlappedEventDescription.length + ']: ' + event1.url));
        // console.log(clc.magenta('Info: Duplicate event added: ' + event2.url));
        // console.log(clc.magenta('Info: Duplicate event overlaps: ' + overlappedEventDescription));
        // console.log(clc.magenta('-----------'))
        return true;
      }
    }

    return false;
  }

  function afterToday(evt) {
    return moment(evt.formatted_time, config.displayTimeformat) > moment();
  }

  function timeComparer(a, b) {
    return (moment(a.start_time).valueOf() -
            moment(b.start_time).valueOf());
  }

  function addEvents(type) {
    API[ 'get' + type + 'Events' ]().then(function(data) {
      data = data || [];
      var whiteEvents = data.filter(function(evt) { // filter black listed ids
        return !blacklistEvents.some(function(blackEvent) {
          return blackEvent.id === evt.id;
        });
      });
      eventsResult.events = eventsResult.events.concat(whiteEvents);
      eventsResult.events = eventsResult.events.filter(afterToday);
      eventsResult.events.sort(timeComparer);
      eventsResult.events = removeDuplicates(eventsResult.events);
      console.log(clc.green('Success: Added ' + whiteEvents.length + ' ' + type + ' events'));
      eventsResult.meta.total_events = eventsResult.events.length;
    }).catch(function(err) {
      console.error(clc.red('Error: Failed to add %s events: %s'), type, err.statusCode || err);
    });
  }

  function removeDuplicates(feed) {
    var uniqueEvents = [];
    var isDuplicate;

    feed.forEach(function(thisEvent) {
      isDuplicate = uniqueEvents.some(function(thatEvent) {
        return isDuplicateEvent(thisEvent, thatEvent);
      })

      if (!isDuplicate) {
        uniqueEvents.push(thisEvent);
      }
    })

    return uniqueEvents;
  }

  return {
    feed: eventsResult,
    update: function() {
      eventsResult.meta = {
        'generated_at': new Date().toISOString(),
        'location': config.city,
        'api_version': config.api_version
      }
      eventsResult.events = whitelistEvents.filter(afterToday);
      console.log('Info: Updating the events feed... this may take a while');
      addEvents('Meetup');
      addEvents('Facebook');
      addEvents('Eventbrite');
      addEvents('Ics');
    }
  }
};
