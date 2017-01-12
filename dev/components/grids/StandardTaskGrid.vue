<template>
<div class="flatskin-wrapped tasks-table">
  <a class="small primary button float-right" v-on:click="newTask"><i class="fa fa-plus" aria-hidden="true" style="margin-right: 5px;"></i>{{maketext("Create new task")}}</a>
  <!-- Content -->
  <div v-if="parentTask == null || (config.subtaskHeader || false)" class="task-row">
      <div class="row-item" v-for="field in header" :class="field.class || field.id">
          <standard-header-field :grid-state="state" :title="field.title" :field="field.sort_field" :parent-task="parentTask">
          </standard-header-field>
      </div>
  </div>
  <div class="tasks">
    <template v-for="task in currentTasks" :grid-state="state" >
      <component v-bind:is="getTaskRow(task)+'-task-row'" :grid-state="state" :task="task" :config="config"></component>
    </template>
  </div>
  <paginator class="ma-pager-new" :current-page="currentPage" :page-count="pageCount" v-on:page-changed="changeCurrentPage"></paginator>
</div>
</template>

<script>
import TaskGridMixin from "../../mixins/TaskGridMixin.vue";

export default {
    name: "standard-task-grid",
    mixins: [TaskGridMixin],
    props: ['config'],
    computed: {

    },
    methods: {
      newTask(){
        this.$store.dispatch("openNewTaskEditor", {formName: "InternalProjects.InternalProjectTaskForm", gridState: this.state});
      }
    }
};
</script>
<style lang="sass">
.row-item {
    -webkit-flex-grow: 1;
    flex-grow: 1;
    -webkit-flex-basis: 0;
    flex-basis: 0;
    padding: 5px 10px;
    &.title {
        -webkit-flex-grow: 4;
        flex-grow: 4;
        span:first-child {
            font-weight: bold;
        }
    }
    &.close {
        -webkit-flex-grow: 0.2;
        flex-grow: 0.2;
    }
    &.status {
        -webkit-flex-grow: 0.4;
        flex-grow: 0.4;
    }
}
.tasks .row-item {
    &.created {
        color: #777;
        font-size: 11px;
        span {
            display: block;
        }
    }
    &.close {
        span {
            font-size: 1.6em;
            color: #6CCE86;
            cursor: default;
        }
    }
}
.task-row {
    margin: 2px;
}
</style>
