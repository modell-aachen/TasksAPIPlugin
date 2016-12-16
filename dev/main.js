import Vue from 'vue'
import Vuex from 'vuex'

import store from './store'

import TaskGridBootstrap from './components/TaskGridBootstrap.vue'

$( function () {
    new Vue({
        el: '.foswikiTopic',
        store,
        components: {
            TaskGridBootstrap
        }
    })
})