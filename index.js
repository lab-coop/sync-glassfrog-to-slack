'use strict';

// Sync Glassfrog with Slack

const co = require('co');
const fs = require('fs');
const _ = require('lodash');

const slackWrapper = require('./slack-wrapper');
const GlassFrog = require('glassfrog-js');

const config = require('./config');

let glassfrog = GlassFrog(config.glassfrogApiKey, {
  caching: false
});

function loadGlassfrogData() {
  // return new Promise((resolve, reject) => {
  //   fs.stat('circles.jsony', (err, stats) => {
  //     if(err) console.log('ERR', err);
  //     // console.log(stats);
  //     resolve(stats);
  //   });
  // });
  return Promise.all([
    glassfrog
      .get()
      .roles()
      .all()
      .then(result => ({ roles: result[1].roles })),
    glassfrog
      .get()
      .people()
      .all()
      .then(result => ({ people: _.keyBy(result[1].people, 'id') }))
  ]).then(values => _.assign({}, ...values));

  // return Promise.all([
  //   glassfrog.get().circles().all().then(result => fs.writeFile('circles.json', JSON.stringify(result))),
  //   glassfrog.get().roles().all().then(result => fs.writeFile('roles.json', JSON.stringify(result))),
  //   glassfrog.get().people().all().then(result => fs.writeFile('people.json', JSON.stringify(result)))
  // ]).then();
}

function* getRoleGroups() {
  let glassfrogData = yield loadGlassfrogData();

  let roles = glassfrogData.roles;
  let people = glassfrogData.people;

  return getRolesWithEmails(roles, people);
}

co(function*() {
  const slack = slackWrapper(require('slack'));

  // TODO: this is shit
  yield slack.loadUsers();
  yield slack.loadUsergroups();

  let roleGroups = yield getRoleGroups();

  console.log('Disabling obsole roles..');
  yield slack.disableOldUserGroupsEndingWith(roleGroups, '-role');

  console.log('Updating..');
  // console.log('roleGroups', roleGroups);

  _.forIn(
    roleGroups,
    co.wrap(function*(group) {
      // if(_.isEmpty(group.people))

      // if(group.name === 'Badge Librarian') {
      //   console.log(group);
      //   yield slack.addUsersToGroup(group, group.people);
      // }

      yield slack.addUsersToGroup(group, group.people);
    })
  );

  // yield slack.disableOldUserGroupsEndingWith(roleGroups, '-role');
}).catch(err => {
  console.log('ERROR', err.stack);
});

function getRolesWithEmails(roles, people) {
  let groups = _.sortBy(roles, 'name').reduce((groups, role) => {
    let handle = _.kebabCase(role.name) + '-role';
    let peopleIds = role.links.people;

    groups[handle] = groups[handle] || {
      name: role.name,
      handle: handle,
      purpose: role.purpose || '',
      glassFrogId: role.id
    };

    groups[handle].people = _.concat(
      groups[handle].people || [],
      getPeopleEmails(peopleIds, people)
    );

    return groups;
  }, {});

  return groups;
}

function getPeopleEmails(peopleIds, people) {
  peopleIds = _.isArray(peopleIds) ? peopleIds : [peopleIds];

  return peopleIds.map(id => people[id].email);
}
