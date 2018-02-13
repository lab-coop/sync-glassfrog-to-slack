'use strict';

const co = require('co');
const promisify = require('promisify-node');

const _ = require('lodash');

const token = require('./config').slackApiKey;

module.exports = function(slackApi) {
  const slack = promisify(slackApi);

  let users, usergroups;

  return {
    loadUsers: function*() {
      users = yield getUsers();
    },
    loadUsergroups: function*() {
      usergroups = yield getUserGroupsByHandle();
    },
    disableUserGroupsEndingWith: function*(ending) {
      _.forIn(
        usergroups,
        co.wrap(function*(id, key) {
          if (key.endsWith(ending)) {
            yield disableUserGroup(id);
          }
        })
      );
    },
    disableOldUserGroupsEndingWith: function*(roleGroups, ending) {
      const obsoleteUsergroups = _.difference(
        Object.keys(usergroups),
        Object.keys(roleGroups)
      ).filter(handle => handle.endsWith(ending));

      obsoleteUsergroups.map(
        co.wrap(function*(handle) {
          const id = usergroups[handle];
          yield disableUserGroup(id);
        })
      );
    },
    addUsersToGroup: function*(group, userEmails) {
      if (_.isEmpty(userEmails)) return;

      let userIds = _.compact(
        userEmails.map(email => _.get(getUserFromEmail(email), 'id'))
      );

      if (_.isEmpty(userIds)) return;

      if (usergroups[group.handle]) {
        let id = usergroups[group.handle];
        console.log(`Updating ${group.handle} id: ${id}..`);

        yield enableUserGroup(id);
        // console.log(`Enabled ${group.handle}`);

        if (!group.handle.endsWith('-role')) {
          yield updateUserGroup(
            id,
            group.name,
            `${group.handle}-role`,
            group.purpose
          );
        } else {
          yield updateUserGroup(id, group.name, group.handle, group.purpose);
        }

        try {
          yield updateUserGroupUsers(id, userIds);
        } catch (error) {
          console.log('Error updateUserGroupUsers', group, userEmails);
        }
      } else {
        let id = yield createUserGroup(group);
        yield updateUserGroupUsers(id, userIds);
      }
    },
    createUserGroup,
    updateUserGroup,
    disableUserGroup,
    enableUserGroup,
    updateUserGroupUsers,
    getUsers,
    getUserFromEmail,
    getUserGroups,
    getUserGroupsByHandle
  };

  function* createUserGroup(group) {
    try {
      let result = yield slack.usergroups.create({
        token,
        name: group.name,
        handle: group.handle,
        description: group.description
      });

      return result.id;
    } catch (err) {
      console.error('ERROR createUserGroup', err, group);
    }
  }

  function* updateUserGroup(id, name, handle, description) {
    // description max 140
    description = (description || '').replace(/[“”]/g, '"');
    description = _.truncate(description, { length: 140, separator: /\s? +/ });
    try {
      yield slack.usergroups.update({
        token,
        usergroup: id,
        name,
        handle,
        description
      });
    } catch (err) {
      console.error('ERROR updateUserGroup', err.message, {
        id,
        name,
        handle,
        description
      });
    }
  }

  function* disableUserGroup(id) {
    try {
      yield slack.usergroups.disable({ token, usergroup: id });
    } catch (error) {
      if (error.message !== 'already_disabled') {
        console.log('Error: unable to disable group', key, id);
        throw error;
      }
    }
  }

  function* enableUserGroup(id) {
    try {
      yield slack.usergroups.enable({ token, usergroup: id });
    } catch (error) {
      if (error.message !== 'already_enabled') {
        throw error;
      }
    }
  }

  function* updateUserGroupUsers(id, userIds) {
    try {
      let result = yield slack.usergroups.users.update({
        token,
        usergroup: id,
        users: userIds.join(',')
      });
    } catch (err) {
      console.error('Error updateUserGroupUsers', err.message, { id, userIds });
    }
  }

  function* getUsers() {
    let users = yield slack.users.list({ token });

    return users.members;
  }

  function getUserFromEmail(email) {
    let user = users.find(user => user.profile.email === email);

    return user;
  }

  function* getUserGroups() {
    let usergroups = (yield slack.usergroups.list({
      token,
      include_disabled: true
    })).usergroups;

    return usergroups;
  }

  function* getUserGroupsByHandle() {
    let usergroups = yield getUserGroups();

    let usergroupsByHandle = usergroups.reduce((groups, group) => {
      groups[group.handle] = group.id;

      return groups;
    }, {});

    return usergroupsByHandle;
  }
};
