<template>
    <div class="flatskin-wrapped">
      <label for="{{id}}">Pick a nice date</label>
      <div class="input-group">
        <input type="text" data-format="dd.mm.yyyy" data-epoch="" name="" data-name="DueDate" class="foswikiInputField datepicker foswikiPickADate picker__input" id="{{id}}" v-model="datePicker">
        <span class="input-group-label" style="margin: 0 0 1rem;"><i class="fa fa-calendar calendersymbol" aria-hidden="true"></i></span>
      </div>
    </div>
</template>

<script>
export default {
    data:  function () {
       return {
          datePicker: ''
       };
    },
    props: ['params'],
    computed: {
      id: function(){
        return "23_picker";
      }
    },
    beforeCompile: function(){
    
    }
};
</script>
<style lang="sass">
  .datepicker {
    background: #fff;
    -webkit-font-smoothing: antialiased;
  }
</style>

