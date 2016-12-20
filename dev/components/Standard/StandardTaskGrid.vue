<template>
<div class="flatskin-wrapped">
  <!-- Content -->
  <div class="task-row">
      <div class="row-item" v-for="field in config.fields">
          <standard-header-field :grid-state="state" :title="field.title" :field="field.sort_field">
          </standard-header-field>
      </div>
  </div>
  <standard-task-row v-for="task in currentTasks" :task="task" :config="config"></standard-task-row>
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
    },
    created() {
        console.log(this.config.fields[0].title);
    }
};
</script>

<style lang="sass">
</style>
