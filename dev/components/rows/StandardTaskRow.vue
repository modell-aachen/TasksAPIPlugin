<template>
<div>
    <div v-if="task" class="test task task-row" :class="hasPriority" v-on:click="togglePanelStatus">
        <div class="row-item" v-for="field in this.getConfig(task).fields" :class="field.class || field.id">
            <component :is="field.component.type+'-data-field'" :task="task" :config="field.component" :grid-state="gridState">
            </component>
        </div>
    </div>
    <div v-if="hasChildren(task)" v-show="showChildren" class="child-tasks">
        <component :is="childTaskGrid" :parent-state="gridState" :tasks="task.children" :parent-task="task.id" :config="config"></component>
    </div>
    <!--<div v-show="showChildren" class="task-new">
        <button>Add sub task!</button>
    </div>-->
</div>
</template>


<script>
import TaskRowMixin from "../../mixins/TaskRowMixin.vue";

export default {
    name: "standard-task-row",
    mixins: [TaskRowMixin],
    props: ['config'],
    computed: {
        hasPriority() {
            if(this.task.fields['Prioritize'].value === 'Yes') {
                return 'prioritize';
            }
            return '';
        }
    },
    methods: {
        togglePanelStatus() {
            this.$store.dispatch('showTaskDetails', {task: this.task, gridState: this.gridState});
       }
    },
    beforeCreate: function () {
       this.$options.components.StandardTaskGrid = require ("../grids/StandardTaskGrid.vue");
    }
};
</script>

<style lang="sass">
</style>
