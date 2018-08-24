import store from './store'

import TaskGridBootstrap from './components/TaskGridBootstrap.vue'
import TaskPanelBootstrap from './components/TaskPanelBootstrap.vue'
import TaskGridMixin from './mixins/TaskGridMixin.vue'
import TaskRowMixin from './mixins/TaskRowMixin.vue'
import StandardTaskRow from './components/rows/StandardTaskRow.vue'
import StandardTaskGrid from './components/grids/StandardTaskGrid.vue'


var TasksAPIPlugin = {
    registerComponent: function(name, component){
        Vue.component(name, component);
    },
    components: {
        StandardTaskGrid,
        StandardTaskRow
    },
    mixins: {
        TaskGridMixin,
        TaskRowMixin
    }
};
window.TasksAPIPlugin = TasksAPIPlugin;

$( function () {
    Vue.instantiateEach(
        '.TaskGridContainer',
        { store: store,
          components: {
            TaskGridBootstrap,
            TaskPanelBootstrap
          }
        }
    );
})
