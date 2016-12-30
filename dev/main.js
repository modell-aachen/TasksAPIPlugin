import Vue from 'vue'
import Vuex from 'vuex'

import store from './store'

import TaskGridBootstrap from './components/TaskGridBootstrap.vue'
import TaskGridMixin from './mixins/TaskGridMixin.vue'
import TaskRowMixin from './mixins/TaskRowMixin.vue'
import StandardTaskRow from './components/rows/StandardTaskRow.vue'
import StandardTaskGrid from './components/grids/StandardTaskGrid.vue'

window.Vue = Vue;
var TasksAPIPlugin = {
    registerComponent: function(name, component){
        Vue.component(name, component);
    },
    components: {
        StandardTaskGrid,
        StandardTaskRow
    }
    mixins: {
        TaskGridMixin,
        TaskRowMixin
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
