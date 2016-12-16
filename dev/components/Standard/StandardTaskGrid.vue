<template>
<div class="flatskin-wrapped">
  <!-- Content -->
  <div class="task-row">
  <div class="row-item"><standard-header-field :grid-state="state" title="Priority" field="Prioritize"></standard-header-field></div>
  <div class="row-item"><standard-header-field :grid-state="state" title="Created" field="Created"></standard-header-field></div>
  <div class="row-item"><standard-header-field :grid-state="state" title="Type" field="Type"></standard-header-field></div>
  <div class="row-item"><standard-header-field :grid-state="state" title="Assigned" field="AssignedTo"></standard-header-field></div>
  <div class="row-item"><standard-header-field :grid-state="state" title="Title" field="Title"></standard-header-field></div>
  <div class="row-item"><standard-header-field :grid-state="state" title="Due" field="DueDate"></standard-header-field></div>
  <div class="row-item"><standard-header-field :grid-state="state" title="Status" field="Status"></standard-header-field></div>
  </div>
  <standard-task-row v-for="task in currentTasks" :task="task"></standard-task-row>
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
    components : {
      StandardTaskRow,
      StandardHeaderField,
      Paginator
    }
};
</script>

<style lang="sass">
</style>
