import Vue from 'vue'
import Vuex from 'vuex'

import store from './store'

import TaskGridBootstrap from './components/TaskGridBootstrap.vue'
import TaskGridMixin from './mixins/TaskGridMixin.vue'
import TaskRowMixin from './mixins/TaskRowMixin.vue'
import StandardTaskRow from './components/Standard/StandardTaskRow.vue'
import StandardTaskGrid from './components/Standard/StandardTaskGrid.vue'

window.Vue = Vue;
var TasksAPIPlugin = {
    registerComponent: function(name, component){
        component.components = {StandardTaskGrid};
        Vue.component(name, component);
    },
    getTaskRowMixin: function(){
        return TaskRowMixin;
    },
    getTaskGridMixin: function(){
        return TaskGridMixin;
    }
};
window.TasksAPIPlugin = TasksAPIPlugin;

$( function () {
    new Vue({
        el: '.foswikiTopic',
        store,
        components: {
            TaskGridBootstrap
        }
    })
})
