<template>
<div>
    <div v-if="task" class="milestone-task milestone-task-row">
        <div class="row-item" v-for="field in this.getConfig(task).fields" :class="field.class || field.id">
            <component v-bind:is="field.component.type+'-data-field'" :task="task" :config="field.component" :grid-state="gridState">
            </component>
        </div>
    </div>
    <div v-if="this.hasChildren(task)" class="child-tasks">
        <template v-for="task in this.getChildTasks(task)" :grid-state="gridState" >
          <component v-bind:is="getTaskRow(task)+'-task-row'" :grid-state="gridState" :task="task" :config="config"></component>
        </template>
    </div>
</div>
</template>


<script>
import TaskRowMixin from "../../mixins/TaskRowMixin.vue";
import TaskGridMixin from "../../mixins/TaskGridMixin.vue";
export default {
    name: "milestone-task-row",
    mixins: [TaskRowMixin,TaskGridMixin],
    props: ['config'],
    computed: {

    },
    methods: {
    },
    components : {
        TaskRowMixin,
        TaskGridMixin
    }
};
</script>

<style lang="sass">
.milestone-task-row {
    display: -webkit-box;
    display: -ms-flexbox;
    display: flex;
    -webkit-box-orient: horizontal;
    -webkit-box-direction: normal;
    -ms-flex-direction: row;
    flex-direction: row;
    -ms-flex-wrap: wrap;
    flex-wrap: wrap;
    -webkit-box-flex: 0;
    -ms-flex-positive: 0;
    flex-grow: 0;
    width: 100%;
}
.tasks-table .milestone-task{
    background-color: #DDDFBD;
    border-left: 5px solid transparent;
    border-bottom: 3px solid #fff;
    border-radius: 3px;
    position: relative;
    transition: background-color .2s ease-in-out;
    height: 50px;
}
</style>
