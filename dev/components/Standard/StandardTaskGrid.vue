<template>
<div class="flatskin-wrapped tasks-table">
  <!-- Content -->
  <div class="task-row">
      <div class="row-item" v-for="field in config.fields" :class="field.class || field.id">
          <standard-header-field :grid-state="state" :title="field.title" :field="field.sort_field">
          </standard-header-field>
      </div>
  </div>
  <div class="tasks">
      <standard-task-row v-for="task in currentTasks" :grid-state="state" :task="task" :config="config"></standard-task-row>
  </div>
  <paginator class="ma-pager-new" :current-page="currentPage" :page-count="pageCount" v-on:page-changed="changeCurrentPage"></paginator>
</div>
</template>


<script>
import TaskGridMixin from "../../mixins/TaskGridMixin.vue";
import StandardTaskRow from "./StandardTaskRow.vue";
import StandardHeaderField from "./StandardHeaderField.vue";
import Paginator from 'vue-simple-pagination/VueSimplePagination.vue';

/* global $ foswiki*/
export default {
    name: "standard-task-grid",
    mixins: [TaskGridMixin],
    props: ['config'],
    components : {
      StandardTaskRow,
      StandardHeaderField,
      Paginator
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
</style>
